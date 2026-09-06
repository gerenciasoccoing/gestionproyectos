const { sequelize, BudgetScheduleItem } = require('../models');
const ApiError = require('../utils/ApiError');
const { extractStructuredDataFromText, isConfigured } = require('./aiVisionService');
const { getCurrentBudgetForProject, getBudgetItemsWithProgress } = require('./budgetService');
const { getProjectTimeframe } = require('./evmService');

const MS_PER_DAY = 86400000;

// Reparto uniforme cuando la IA no está configurada o falla: mismo orden en que aparecen los
// ítems del presupuesto, todos con el mismo peso — el cronograma se genera igual, sin bloquear
// nunca "Generar cronograma" (mismo criterio que el texto de respaldo de los Informes con IA).
function buildFallbackPlan(items) {
  return items.map((it, idx) => ({ itemId: it.id, sequenceOrder: idx + 1, durationDays: 7 }));
}

// La IA SOLO aporta juicio de secuencia constructiva (qué va antes/después) y una duración
// RELATIVA de cada ítem — nunca calcula fechas de calendario (eso lo hace distributeDates, con
// aritmética simple, para poder garantizar que ningún ítem caiga fuera del rango del contrato
// pase lo que pase en la respuesta de la IA).
async function getAiPlan(items) {
  if (!isConfigured() || !items.length) return buildFallbackPlan(items);

  const text = items.map((it) => `- id:${it.id} | ${it.description} | unidad:${it.unit} | cantidad:${it.quantity}`).join('\n');
  const instructions = 'Eres un experto en programación de obra civil. A partir de esta lista de ítems de '
    + 'presupuesto de un proyecto de construcción, define UNA secuencia constructiva lógica (por ejemplo: '
    + 'excavación y cimentación antes que estructura, estructura antes que muros, muros antes que acabados) '
    + 'y una duración estimada en días de trabajo para cada ítem, según su cantidad y su naturaleza. '
    + 'IMPORTANTE: no calcules fechas de calendario ni asumas una fecha de inicio — solo el orden relativo '
    + '(sequenceOrder, empezando en 1) y la duración relativa (durationDays) de cada ítem. Usa EXACTAMENTE '
    + 'los "id" tal como aparecen en la lista, uno por cada ítem, sin omitir ninguno.';
  const schemaDescription = '{ "items": [ { "itemId": string, "sequenceOrder": number, "durationDays": number } ] }';

  try {
    const result = await extractStructuredDataFromText({ text, instructions, schemaDescription, maxTokens: 3000 });
    const plan = Array.isArray(result?.items) ? result.items : [];
    const byId = new Map(plan.map((p) => [p.itemId, p]));
    const valid = items.every((it) => {
      const p = byId.get(it.id);
      return p && Number(p.durationDays) > 0;
    });
    // Si la IA no cubrió TODOS los ítems (o inventó ids que no existen), es más seguro caer al
    // reparto uniforme que mezclar un plan parcial con fechas incompletas.
    if (!valid) return buildFallbackPlan(items);
    return items.map((it) => ({
      itemId: it.id,
      sequenceOrder: Number(byId.get(it.id).sequenceOrder) || 0,
      durationDays: Number(byId.get(it.id).durationDays),
    }));
  } catch (err) {
    console.error('[scheduleService] Falla generando cronograma con IA, se usa reparto uniforme:', err.message);
    return buildFallbackPlan(items);
  }
}

// Convierte el plan (orden + duración relativa) en fechas de calendario reales, distribuidas
// secuencialmente dentro de [start, end] SIN salirse nunca de ese rango: el último ítem de la
// secuencia absorbe el redondeo para terminar exactamente en `end`. Esta es la única función que
// decide fechas — la IA nunca las calcula (ver getAiPlan).
function distributeDates(plan, start, end) {
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
  const totalWeight = plan.reduce((s, p) => s + p.durationDays, 0) || plan.length;
  const sorted = [...plan].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  const results = [];
  let cursor = 0;
  sorted.forEach((p, idx) => {
    const isLast = idx === sorted.length - 1;
    const share = p.durationDays / totalWeight;
    let duration = Math.max(1, Math.round(share * totalDays));
    if (isLast) duration = Math.max(1, totalDays - cursor);
    const itemStart = new Date(start.getTime() + cursor * MS_PER_DAY);
    const cappedEndOffset = Math.min(cursor + duration, totalDays);
    const itemEnd = new Date(start.getTime() + cappedEndOffset * MS_PER_DAY);
    results.push({ itemId: p.itemId, sequenceOrder: idx + 1, plannedStart: itemStart, plannedEnd: itemEnd });
    cursor = cappedEndOffset;
  });
  return results;
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

// Genera (o regenera por completo) el cronograma del proyecto: reemplaza cualquier
// BudgetScheduleItem existente de los ítems del presupuesto vigente por uno nuevo.
async function generateSchedule(projectId) {
  const budget = await getCurrentBudgetForProject(projectId);
  if (!budget) throw new ApiError(404, 'Este proyecto no tiene un presupuesto');
  const items = budget.items.map((it) => it.toJSON());
  if (!items.length) throw new ApiError(400, 'El presupuesto no tiene ítems para programar');

  const timeframe = await getProjectTimeframe(projectId);
  if (timeframe.start.getTime() === timeframe.end.getTime()) {
    throw new ApiError(400, 'Este proyecto no tiene fecha de inicio y fin de contrato registradas. Agrégalas en Contractual antes de generar el cronograma.');
  }

  const plan = await getAiPlan(items);
  const dated = distributeDates(plan, timeframe.start, timeframe.end);

  return sequelize.transaction(async (t) => {
    const itemIds = items.map((it) => it.id);
    await BudgetScheduleItem.destroy({ where: { budgetItemId: itemIds }, transaction: t });
    const rows = dated.map((d) => ({
      budgetItemId: d.itemId,
      sequenceOrder: d.sequenceOrder,
      plannedStart: toDateOnly(d.plannedStart),
      plannedEnd: toDateOnly(d.plannedEnd),
    }));
    await BudgetScheduleItem.bulkCreate(rows, { transaction: t });
    return getSchedule(projectId, { transaction: t });
  });
}

// Cronograma vigente del proyecto, con la descripción/unidad/cantidad de cada ítem (para mostrar
// y exportar sin una segunda consulta desde el controlador), el rango de contrato usado como
// referencia del Gantt, y el % de avance REAL ya registrado en Avance por Ítem (ver
// budgetService.getBudgetItemsWithProgress — misma fuente que usa esa pantalla, sin datos
// duplicados) para poder marcar qué ítems van atrasados respecto a su fecha planeada.
async function getSchedule(projectId, { transaction } = {}) {
  const { items } = await getBudgetItemsWithProgress(projectId);
  const itemIds = items.map((it) => it.id);
  const scheduleItems = itemIds.length
    ? await BudgetScheduleItem.findAll({ where: { budgetItemId: itemIds }, order: [['sequenceOrder', 'ASC']], transaction })
    : [];
  const itemById = new Map(items.map((it) => [it.id, it]));
  const timeframe = await getProjectTimeframe(projectId);
  const todayStr = toDateOnly(new Date());

  return {
    timeframe: { start: toDateOnly(timeframe.start), end: toDateOnly(timeframe.end) },
    items: scheduleItems.map((s) => {
      const item = itemById.get(s.budgetItemId);
      const percent = item ? item.percent : 0;
      let status;
      if (percent >= 100) status = 'completado';
      else if (todayStr < s.plannedStart) status = 'pendiente';
      else if (todayStr > s.plannedEnd) status = 'atrasado';
      else status = 'en_curso';
      return {
        budgetItemId: s.budgetItemId,
        description: item?.description || '-',
        unit: item?.unit || '-',
        quantity: item ? Number(item.quantity) : null,
        sequenceOrder: s.sequenceOrder,
        plannedStart: s.plannedStart,
        plannedEnd: s.plannedEnd,
        percent,
        status,
      };
    }),
  };
}

module.exports = { generateSchedule, getSchedule };
