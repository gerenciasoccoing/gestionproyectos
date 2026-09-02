const { Op } = require('sequelize');
const { Project, Expense, ExpenseBudget, ProgressEntry, ProgressPhoto } = require('../models');
const ApiError = require('../utils/ApiError');
const { getBudgetItemsWithProgress } = require('./budgetService');
const { getProjectTimeframe } = require('./evmService');
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

// Galería de fotos por ítem (mismo criterio que reportController#progressByItem: una sola
// consulta para todos los ítems, sin filtro de fecha — el Informe para Cliente siempre muestra el
// registro fotográfico completo de avance, no solo el del rango, porque no tiene selector de rango).
async function attachPhotosToItems(items) {
  if (!items.length) return items;
  const allEntries = await ProgressEntry.findAll({
    where: { budgetItemId: items.map((i) => i.id) },
    include: [{ model: ProgressPhoto, as: 'photos' }],
    order: [['date', 'ASC']],
  });
  const photosByItem = new Map();
  for (const entry of allEntries) {
    const list = photosByItem.get(entry.budgetItemId) || [];
    list.push(...entry.photos.map((p) => p.filePath));
    photosByItem.set(entry.budgetItemId, list);
  }
  return items.map((item) => ({ ...item, photos: photosByItem.get(item.id) || [] }));
}

function buildClientFallbackSummary({ project, snapshot }) {
  return `El proyecto "${project.name}" registra un avance físico del ${snapshot.physicalProgressPercent}% `
    + `a la fecha, con un valor ejecutado de ${money(snapshot.totalExecutedValue)} sobre un presupuesto `
    + `total de ${money(snapshot.totalBudgetedValue)}.`;
}

async function generateClientSummary({ project, snapshot }) {
  if (!isConfigured()) return buildClientFallbackSummary({ project, snapshot });
  const prompt = `Eres un asistente que redacta el resumen ejecutivo de un informe de avance de obra para `
    + `un CLIENTE externo (no interno de la empresa constructora). Escribe en español, en un solo párrafo `
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
  return text || buildClientFallbackSummary({ project, snapshot });
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

// Informe para Cliente: siempre con corte a la fecha actual (sin selector de rango), sin cifras
// financieras internas (costos reales/margen/rentabilidad) más allá de presupuesto vs ejecutado
// por ítem — que es información que YA se comparte con el cliente en la ejecución normal del
// contrato.
async function getClientReportData(projectId) {
  const project = await Project.findByPk(projectId);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');

  const snapshot = await getExecutionSnapshot(projectId);
  const items = await attachPhotosToItems(snapshot.items);
  const summaryText = await generateClientSummary({ project, snapshot });

  return { project, snapshot: { ...snapshot, items }, asOfDate: new Date(), summaryText };
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

module.exports = { getExecutionSnapshot, getClientReportData, getInternalReportData };
