const { Op } = require('sequelize');
const { Project, Expense, ExpenseBudget, ProgressEntry, ProgressPhoto, Contract, Minute, Employee, ThirdParty } = require('../models');
const ApiError = require('../utils/ApiError');
const { getBudgetItemsWithProgress } = require('./budgetService');
const { getProjectTimeframe, computeSCurve } = require('./evmService');
const { getLetterheadForProject } = require('./letterheadService');
const { generateText, isConfigured } = require('./aiVisionService');

const EXPENSE_CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];

function money(n) {
  return `$ ${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

// Mismas fórmulas que executionDashboardController#getDashboard (el Dashboard de Ejecución que ya
// ve el usuario), con un rango de fecha opcional: sin `from`/`to` da exactamente los mismos
// números que el dashboard en vivo (Informe para Cliente, corte a hoy); con rango, tanto el avance
// por ítem (vía getBudgetItemsWithProgress) como los gastos quedan acotados a esas fechas
// (Informe Interno). Una sola fuente de verdad para ambos informes y para el dashboard: si algún
// día cambia la fórmula de % avance físico, se cambia en un solo lugar además de acá.
async function getExecutionSnapshot(projectId, { from, to } = {}) {
  const { budget, items } = await getBudgetItemsWithProgress(projectId, { from, to });

  const totalBudgetedValue = items.reduce((sum, i) => sum + Number(i.totalCost), 0);
  const totalExecutedValue = items.reduce((sum, i) => sum + Number(i.executedValue), 0);
  const totalBudgetedQty = items.reduce((sum, i) => sum + Number(i.quantity), 0);
  const totalAccumulatedQty = items.reduce((sum, i) => sum + Number(i.accumulatedQty), 0);
  const physicalProgressPercent = totalBudgetedQty > 0
    ? Math.round((totalAccumulatedQty / totalBudgetedQty) * 10000) / 100
    : 0;

  const expenseWhere = { projectId };
  if (from || to) {
    expenseWhere.date = {};
    if (from) expenseWhere.date[Op.gte] = from;
    if (to) expenseWhere.date[Op.lte] = to;
  }
  const expenses = await Expense.findAll({ where: expenseWhere });
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const expensesByCategory = EXPENSE_CATEGORIES.map((category) => ({
    category,
    amount: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + Number(e.amount), 0),
  }));

  return { budget, items, totalBudgetedValue, totalExecutedValue, physicalProgressPercent, totalExpenses, expensesByCategory };
}

// Etiquetas legibles de Minute.type (ver backend/src/models/Minute.js) — solo se usan acá, para
// redactar la descripción por defecto de la sección "Actas del proyecto" del Informe para Cliente;
// el frontend tiene su propia versión (execution.minutes.types.* en i18n) para las insignias de la
// pantalla de Actas, no vale la pena compartir una sola fuente entre backend y frontend por esto.
const MINUTE_TYPE_LABELS_ES = {
  inicio: 'Acta de Inicio',
  suspension: 'Acta de Suspensión',
  reinicio: 'Acta de Reinicio',
  terminacion: 'Acta de Terminación',
  final: 'Acta Final',
  liquidacion: 'Acta de Liquidación',
};

// Descripción por defecto de las actas del proyecto: puramente determinística (sin IA) — Minute
// solo tiene tipo+fecha (es un documento adjunto, no un texto), así que no hay nada que redactar
// más allá de listarlas; el usuario la edita a mano en la vista previa si quiere agregar contexto.
function buildActasDescription(minutes) {
  if (!minutes.length) return 'A la fecha no se han registrado actas para este proyecto.';
  const lines = minutes.map((m) => `- ${MINUTE_TYPE_LABELS_ES[m.type] || m.type}, con fecha ${m.date}.`);
  return `Durante la ejecución del proyecto se han registrado las siguientes actas:\n${lines.join('\n')}`;
}

function buildClientIntroductionFallback({ project, snapshot }) {
  return `El presente informe presenta el estado de avance del proyecto "${project.name}" a la fecha, `
    + `con un avance físico acumulado del ${snapshot.physicalProgressPercent}% y un valor ejecutado de `
    + `${money(snapshot.totalExecutedValue)} sobre un presupuesto total de ${money(snapshot.totalBudgetedValue)}.`;
}

// Texto de la sección "Introducción" (no "resumen ejecutivo": ese nombre quedó del formato
// anterior del Informe para Cliente, ver tabla de contenido nueva de 9 secciones) — mismo criterio
// que el resto de textos generados por IA en esta app: solo redacta con las cifras que ya se
// calcularon, nunca inventa ni calcula cifras propias.
async function generateClientIntroduction({ project, snapshot }) {
  if (!isConfigured()) return buildClientIntroductionFallback({ project, snapshot });
  const prompt = `Eres un asistente que redacta la INTRODUCCIÓN de un informe de avance de obra para un `
    + `CLIENTE externo (no interno de la empresa constructora). Escribe en español, en un solo párrafo `
    + `corto (máximo 5 líneas), tono profesional y comercial, sin encabezados ni listas ni markdown.\n\n`
    + `Usa EXCLUSIVAMENTE estos datos reales (no inventes ni calcules cifras adicionales, no menciones `
    + `costos internos de la empresa, márgenes, rentabilidad ni nombres de proveedores):\n`
    + `- Proyecto: ${project.name}\n`
    + `- Cliente: ${project.client || 'N/A'}\n`
    + `- Avance físico acumulado: ${snapshot.physicalProgressPercent}%\n`
    + `- Presupuesto total del proyecto: ${money(snapshot.totalBudgetedValue)}\n`
    + `- Valor ejecutado a la fecha: ${money(snapshot.totalExecutedValue)}\n`
    + `- Cantidad de ítems del presupuesto: ${snapshot.items.length}\n`;
  const text = await generateText(prompt, 500);
  return text || buildClientIntroductionFallback({ project, snapshot });
}

function buildInternalFallbackAnalysis({ project, snapshot, from, to }) {
  const deviation = snapshot.totalBudgetedValue - snapshot.totalExpenses;
  const deviationLabel = deviation >= 0 ? 'por debajo del presupuesto' : 'por encima del presupuesto';
  return `Entre ${from} y ${to}, el proyecto "${project.name}" avanzó físicamente un ${snapshot.physicalProgressPercent}% `
    + `y registró gastos por ${money(snapshot.totalExpenses)} contra un presupuesto de contrato de `
    + `${money(snapshot.totalBudgetedValue)}, es decir ${money(Math.abs(deviation))} ${deviationLabel}.`;
}

async function generateInternalAnalysis({ project, snapshot, from, to }) {
  if (!isConfigured()) return buildInternalFallbackAnalysis({ project, snapshot, from, to });
  const categoryLines = snapshot.expensesByCategory.map((c) => `  - ${c.category}: ${money(c.amount)}`).join('\n');
  const deviation = snapshot.totalBudgetedValue - snapshot.totalExpenses;
  const prompt = `Eres un asistente que redacta el análisis gerencial de un informe INTERNO de obra, dirigido `
    + `al gerente/dueño de una empresa constructora (no es para el cliente). Escribe en español, en 1 o 2 `
    + `párrafos cortos (máximo 8 líneas en total), tono analítico y directo, sin encabezados ni listas ni `
    + `markdown, mencionando desviación presupuestal y cualquier alerta relevante que se desprenda de las `
    + `cifras.\n\n`
    + `Usa EXCLUSIVAMENTE estos datos reales del rango ${from} a ${to} (no inventes ni calcules cifras `
    + `adicionales a las de aquí):\n`
    + `- Proyecto: ${project.name}\n`
    + `- Presupuesto total del contrato: ${money(snapshot.totalBudgetedValue)}\n`
    + `- Avance físico en el rango: ${snapshot.physicalProgressPercent}%\n`
    + `- Valor ejecutado (valor ganado) en el rango: ${money(snapshot.totalExecutedValue)}\n`
    + `- Gastado real en el rango: ${money(snapshot.totalExpenses)}\n`
    + `- Desviación presupuesto - gastado: ${money(deviation)} (${deviation >= 0 ? 'a favor' : 'en contra'})\n`
    + `- Gastado por tipo de gasto:\n${categoryLines}\n`;
  const text = await generateText(prompt, 700);
  return text || buildInternalFallbackAnalysis({ project, snapshot, from, to });
}

// Por cada ítem, sus avances (ProgressEntry) con sus fotos y la nota de ese avance específico —
// a diferencia de attachPhotosToItems (versión anterior, ya retirada), acá NO se aplanan todas las
// fotos del ítem en una sola lista: la sección 8 del Informe para Cliente necesita agrupar
// foto(s)+descripción POR avance, con la descripción siempre después del bloque de fotos de ESE
// avance (ver drawPhotoGrid en pdfService.js).
async function attachAvancesToItems(items) {
  if (!items.length) return items;
  const entries = await ProgressEntry.findAll({
    where: { budgetItemId: items.map((i) => i.id) },
    include: [{ model: ProgressPhoto, as: 'photos' }],
    order: [['date', 'ASC']],
  });
  const entriesByItem = new Map();
  for (const entry of entries) {
    const list = entriesByItem.get(entry.budgetItemId) || [];
    list.push({
      progressEntryId: entry.id,
      fecha: entry.date,
      cantidadEjecutada: Number(entry.quantityExecuted),
      fotos: entry.photos.map((p) => p.filePath),
      descripcionText: entry.notes || '',
    });
    entriesByItem.set(entry.budgetItemId, list);
  }
  return items.map((item) => {
    const totalCost = Number(item.totalCost);
    // Nota: con los datos que hoy registra Avance por Ítem, porcentajeEconomico siempre coincide
    // con porcentajeFisico — executedValue es accumulatedQty * unitCost (el mismo unitCost fijo del
    // ítem), y totalCost es quantity * ese mismo unitCost, así que la razón es matemáticamente
    // idéntica a accumulatedQty/quantity. No hay en el sistema un costo real POR ÍTEM distinto del
    // presupuestado (los gastos reales, Expense, no están vinculados a un ítem de presupuesto, solo
    // al proyecto) — inventar esa distinción requeriría un dato que no existe hoy, así que se deja
    // calculado tal cual (correcto, aunque redundante con el físico a nivel de ítem); la diferencia
    // real entre "físico" y "económico" sí aparece en la sección 9, a nivel de todo el proyecto,
    // donde el costo real (AC) sale de Expense de verdad.
    const porcentajeEconomico = totalCost > 0 ? Math.round((Number(item.executedValue) / totalCost) * 10000) / 100 : 0;
    return {
      budgetItemId: item.id,
      descripcion: item.description,
      unidad: item.unit,
      cantidadPresupuestada: Number(item.quantity),
      porcentajeFisico: item.percent,
      porcentajeEconomico,
      avances: entriesByItem.get(item.id) || [],
    };
  });
}

// Informe para Cliente: siempre con corte a la fecha actual (sin selector de rango), sin cifras
// financieras internas (costos reales/margen/rentabilidad) más allá de presupuesto vs ejecutado
// por ítem — que es información que YA se comparte con el cliente en la ejecución normal del
// contrato. Arma el borrador completo de las 9 secciones (ver tabla de contenido del informe);
// se recalcula 100% desde cero cada vez que se llama (incluida la exportación final a PDF), para
// que ningún valor numérico pueda llegar manipulado desde el cliente — ver reportController.js.
async function getClientReportDraft(projectId) {
  const project = await Project.findByPk(projectId, {
    include: [{ model: ThirdParty, as: 'clientParty', attributes: ['id', 'name'] }],
  });
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');

  // Secuencial, no Promise.all: comparten la transacción/conexión de la petición (RLS).
  const contract = await Contract.findOne({ where: { projectId }, order: [['signedDate', 'ASC']] });
  const company = await getLetterheadForProject(projectId);
  const minutes = await Minute.findAll({ where: { projectId }, order: [['date', 'ASC']] });
  const equipo = await Employee.findAll({
    where: { projectId, status: 'activo' },
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'documentNumber', 'epsName', 'pensionFundName', 'arlName'],
  });
  const snapshot = await getExecutionSnapshot(projectId);
  const itemsAvance = await attachAvancesToItems(snapshot.items);
  const sCurve = await computeSCurve(projectId);
  const introduccionText = await generateClientIntroduction({ project, snapshot });

  return {
    project,
    company,
    portada: {
      objeto: contract?.object || null,
      contractNumber: project.contractNumber || null,
      cliente: project.clientParty?.name || project.client || null,
      generatedAt: new Date(),
    },
    introduccionText,
    descripcion: project.description || null,
    fotoPortadaPath: project.presentationPhotoPath || null,
    locationMapImagePath: project.locationMapImagePath || null,
    actas: minutes.map((m) => ({ id: m.id, tipo: MINUTE_TYPE_LABELS_ES[m.type] || m.type, fecha: m.date })),
    descripcionActasText: buildActasDescription(minutes),
    equipo: equipo.map((e) => ({
      id: e.id, nombre: e.name, cedula: e.documentNumber || '-',
      eps: e.epsName || '-', fondoPension: e.pensionFundName || '-', arl: e.arlName || '-',
    })),
    items: snapshot.items.map((i) => ({
      itemCode: i.itemCode || i.APU?.code || '-', descripcion: i.description, unidad: i.unit,
      cantidad: Number(i.quantity), valorUnitario: Number(i.unitCost), valorTotal: Number(i.totalCost),
    })),
    valorTotalContrato: snapshot.totalBudgetedValue,
    itemsAvance,
    sCurve,
  };
}

// Aplica las ediciones de texto (nunca valores numéricos: esos ni se leen del body) sobre un
// borrador recién calculado — ver reportController.js#clientReportPdf. `overrides.avanceDescripciones`
// es un mapa progressEntryId -> texto; cualquier id que no exista en el borrador actual (ítem
// borrado entre la vista previa y la exportación) simplemente se ignora.
function applyClientReportOverrides(draft, overrides = {}) {
  const avanceDescripciones = overrides.avanceDescripciones || {};
  return {
    ...draft,
    introduccionText: typeof overrides.introduccionText === 'string' ? overrides.introduccionText : draft.introduccionText,
    descripcionActasText: typeof overrides.descripcionActasText === 'string' ? overrides.descripcionActasText : draft.descripcionActasText,
    itemsAvance: draft.itemsAvance.map((item) => ({
      ...item,
      avances: item.avances.map((av) => (
        typeof avanceDescripciones[av.progressEntryId] === 'string'
          ? { ...av, descripcionText: avanceDescripciones[av.progressEntryId] }
          : av
      )),
    })),
  };
}

// Informe Interno: por rango de fechas (from/to en formato YYYY-MM-DD), por defecto
// [inicio del proyecto, hoy] usando el mismo criterio de "inicio" que ya usa el EVM en vivo
// (getProjectTimeframe: fecha de firma del contrato, o hito más antiguo si no hay contrato).
async function getInternalReportData(projectId, { from, to } = {}) {
  const project = await Project.findByPk(projectId);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');

  const today = new Date().toISOString().slice(0, 10);
  let resolvedFrom = from;
  if (!resolvedFrom) {
    const timeframe = await getProjectTimeframe(projectId);
    resolvedFrom = timeframe.start.toISOString().slice(0, 10);
  }
  const resolvedTo = to || today;
  if (resolvedFrom > resolvedTo) {
    throw new ApiError(400, 'La fecha de inicio no puede ser posterior a la fecha de fin');
  }

  const snapshot = await getExecutionSnapshot(projectId, { from: resolvedFrom, to: resolvedTo });
  const expenseBudgets = await ExpenseBudget.findAll({ where: { projectId } });
  const budgetByCategory = new Map(expenseBudgets.map((b) => [b.category, Number(b.budgetedAmount)]));
  const expensesByCategory = snapshot.expensesByCategory.map((c) => ({
    ...c,
    budgeted: budgetByCategory.get(c.category) || 0,
    available: (budgetByCategory.get(c.category) || 0) - c.amount,
  }));

  const analysisText = await generateInternalAnalysis({ project, snapshot, from: resolvedFrom, to: resolvedTo });

  return {
    project,
    snapshot: { ...snapshot, expensesByCategory },
    from: resolvedFrom,
    to: resolvedTo,
    analysisText,
  };
}

module.exports = {
  getExecutionSnapshot, getClientReportDraft, applyClientReportOverrides, getInternalReportData,
};
