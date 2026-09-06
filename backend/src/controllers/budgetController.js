const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sequelize, Budget, BudgetItem, Project, APU, APUComponent, PriceItem } = require('../models');
const { getBudgetItemsWithProgress, resolveBudgetItemFields, updateBudgetItemQuantity } = require('../services/budgetService');
const { importBudgetFromWorkbook } = require('../services/budgetImportService');
const { scanBudgetItemsFile } = require('../services/budgetItemsScanService');
const { scanItemApu, createBudgetItemsWithProjectApu } = require('../services/projectApuService');
const { computeResourceConsolidation } = require('../services/resourceConsolidationService');
const { buildApuDataByIdMap, buildApuExportData } = require('../services/apuExportService');
const { generateBudgetWithApuAnnexPdf, generateResourceConsolidationPdf } = require('../services/pdfService');
const { generateBudgetWithApuAnnexExcelBuffer, generateResourceConsolidationExcelBuffer } = require('../services/apuExcelExportService');
const { getLetterheadForProject } = require('../services/letterheadService');

// Extrae y valida el AIU discriminado (Administración/Imprevistos/Utilidad) del body.
// Los tres son opcionales de forma independiente; los que no vengan quedan en 0.
function parseAiuPercents(body) {
  const { adminPercent = 0, imprevistosPercent = 0, utilidadPercent = 0 } = body;
  for (const [label, value] of [['adminPercent', adminPercent], ['imprevistosPercent', imprevistosPercent], ['utilidadPercent', utilidadPercent]]) {
    if (Number(value) < 0) throw new ApiError(400, `${label} no puede ser negativo`);
  }
  return { adminPercent, imprevistosPercent, utilidadPercent };
}

// Presupuesto vigente del proyecto (con avance calculado por ítem).
const getProjectBudget = asyncHandler(async (req, res) => {
  const { budget, items } = await getBudgetItemsWithProgress(req.params.projectId);
  res.json({ budget: budget ? budget.toJSON() : null, items });
});

// Crea una nueva versión de presupuesto directamente para un proyecto manual (sin cotización).
// El AIU discriminado (Administración, Imprevistos, Utilidad) se define aquí, al crear el presupuesto.
const createBudgetVersion = asyncHandler(async (req, res) => {
  const { type = 'inicial' } = req.body;
  const aiu = parseAiuPercents(req.body);
  const last = await Budget.findOne({ where: { projectId: req.params.projectId }, order: [['version', 'DESC']] });
  const budget = await Budget.create({
    projectId: req.params.projectId,
    version: last ? last.version + 1 : 1,
    type,
    ...aiu,
  });
  res.status(201).json(budget);
});

// Actualiza el AIU discriminado de un presupuesto ya creado. No recalcula ítems ya agregados
// (su valor unitario queda fijo al momento de agregarlos, igual que si cambia un APU).
const updateBudget = asyncHandler(async (req, res) => {
  const budget = await Budget.findOne({ where: { id: req.params.budgetId, projectId: req.params.projectId } });
  if (!budget) throw new ApiError(404, 'Presupuesto no encontrado');
  const aiu = parseAiuPercents(req.body);
  await budget.update(aiu);
  res.json(budget);
});

const addItem = asyncHandler(async (req, res) => {
  const budget = await Budget.findOne({ where: { id: req.params.budgetId, projectId: req.params.projectId } });
  if (!budget) throw new ApiError(404, 'Presupuesto no encontrado');

  const { apuId, description, notes, unit, quantity, unitCost } = req.body;
  const fields = await resolveBudgetItemFields({ budget, apuId, description, notes, unit, quantity, unitCost });
  const item = await BudgetItem.create(fields);
  res.status(201).json(item);
});

// Edita la cantidad de un ítem ya agregado al presupuesto (el valor unitario y el APU/descripción
// quedan fijos, igual que al agregarlo); recalcula su totalCost.
const updateItem = asyncHandler(async (req, res) => {
  const item = await BudgetItem.findOne({ where: { id: req.params.itemId, budgetId: req.params.budgetId } });
  if (!item) throw new ApiError(404, 'Ítem de presupuesto no encontrado');
  await updateBudgetItemQuantity(item, req.body.quantity);
  res.json(item);
});

// Detalle desplegable del APU que compone un ítem (modo "con APU"): reutiliza EXACTAMENTE la
// misma ficha (4 secciones + AIU + total) que ya arma buildApuExportData para el PDF/Excel del
// presupuesto — ni la fórmula ni la consulta se repiten en el frontend, que solo la muestra en
// pantalla. Funciona igual si el APU es privado de este proyecto o del catálogo global (ver
// APU.projectId): el ítem simplemente no tiene detalle si nunca tuvo un APU asociado (modo sin APU).
const getItemApuDetail = asyncHandler(async (req, res) => {
  const budget = await Budget.findOne({ where: { id: req.params.budgetId, projectId: req.params.projectId } });
  if (!budget) throw new ApiError(404, 'Presupuesto no encontrado');
  const item = await BudgetItem.findOne({ where: { id: req.params.itemId, budgetId: budget.id } });
  if (!item) throw new ApiError(404, 'Ítem de presupuesto no encontrado');
  if (!item.apuId) throw new ApiError(400, 'Este ítem no tiene un APU asociado');

  const apu = await APU.findByPk(item.apuId, {
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  if (!apu) throw new ApiError(404, 'APU no encontrado');

  const aiu = { adminPercent: budget.adminPercent, imprevistosPercent: budget.imprevistosPercent, utilidadPercent: budget.utilidadPercent };
  res.json(buildApuExportData(apu, aiu));
});

const removeItem = asyncHandler(async (req, res) => {
  const item = await BudgetItem.findOne({ where: { id: req.params.itemId, budgetId: req.params.budgetId } });
  if (!item) throw new ApiError(404, 'Ítem de presupuesto no encontrado');
  await item.destroy();
  res.status(204).send();
});

// Lee un presupuesto (imagen, PDF o Excel) con IA y devuelve los ítems que logró reconocer, para
// mostrarlos en una vista previa editable. No crea nada: el usuario revisa/corrige cada fila y
// confirma con addItemsBulk. Siempre sin APU (esta vía es justamente para presupuestos que no
// vienen codificados contra el catálogo de precios unitarios).
const scanItemsFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo PDF, imagen (jpg, png, webp) o Excel (.xlsx, .xls)');
  const result = await scanBudgetItemsFile({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    originalname: req.file.originalname,
  });
  res.json(result);
});

// Crea varios ítems de presupuesto de una sola vez, todos sin APU (con itemCode generado por
// ítem — ver resolveBudgetItemFields), tras la confirmación del usuario sobre la vista previa de
// scanItemsFile. Cada ítem pasa por la misma validación que un ítem manual individual.
const addItemsBulk = asyncHandler(async (req, res) => {
  const budget = await Budget.findOne({ where: { id: req.params.budgetId, projectId: req.params.projectId } });
  if (!budget) throw new ApiError(404, 'Presupuesto no encontrado');

  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Debe enviar al menos un ítem');

  const created = await sequelize.transaction(async (t) => {
    const rows = [];
    for (const raw of items) {
      const fields = await resolveBudgetItemFields({
        budget,
        apuId: null,
        description: raw.description,
        notes: raw.notes,
        unit: raw.unit,
        quantity: raw.quantity,
        unitCost: raw.unitCost,
        transaction: t,
      });
      rows.push(await BudgetItem.create(fields, { transaction: t }));
    }
    return rows;
  });
  res.status(201).json(created);
});

// Lee, con IA, el análisis de precio unitario de UN ítem ya identificado (modo "con APU" de
// Presupuesto del Proyecto) — no crea nada, solo devuelve una vista previa editable (ver
// projectApuService.scanItemApu). itemDescription identifica cuál ítem buscar dentro del archivo,
// que puede ser el mismo que ya trae la lista de ítems o uno adicional subido solo para este ítem.
const scanItemApuFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo PDF, imagen (jpg, png, webp) o Excel (.xlsx, .xls)');
  const { itemDescription } = req.body;
  const result = await scanItemApu({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    originalname: req.file.originalname,
    itemDescription,
  });
  res.json(result);
});

// Confirma en bloque los ítems + APU revisados en la vista previa (scanItemApuFile por cada uno):
// crea, en una sola transacción, un APU privado de este proyecto por ítem (nunca toca la Base de
// Precios global, ver projectApuService.js) y el BudgetItem que lo referencia.
const addItemsWithApu = asyncHandler(async (req, res) => {
  const budget = await Budget.findOne({ where: { id: req.params.budgetId, projectId: req.params.projectId } });
  if (!budget) throw new ApiError(404, 'Presupuesto no encontrado');

  const { entries } = req.body;
  const created = await createBudgetItemsWithProjectApu({ projectId: req.params.projectId, budget, entries });
  res.status(201).json(created);
});

// Sube un Excel de listado de precios unitarios (hojas "Items de Presupuesto" + "Unitarios")
// y crea automáticamente una nueva versión de presupuesto con sus ítems y los APU (con
// materiales/personal/equipos) referenciados, creando en la Base de Precios los insumos que
// no existan todavía. El AIU (Administración/Imprevistos/Utilidad) se define aquí, igual que
// al crear un presupuesto manual.
const importFromFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo Excel (.xlsx o .xls)');
  const aiu = parseAiuPercents(req.body);
  const { type = 'inicial' } = req.body;
  const result = await importBudgetFromWorkbook({ projectId: req.params.projectId, buffer: req.file.buffer, aiu, type });
  res.status(201).json(result);
});

// Reúne el presupuesto vigente con, para cada ítem que tenga un APU asociado, su ficha completa
// ya armada (mismo AIU del presupuesto, no se vuelve a pedir). Los nombres de firma se digitan en
// el momento de exportar (no persisten), igual que en la exportación de un APU individual.
async function buildBudgetExportContext(projectId, body) {
  const { budget, items } = await getBudgetItemsWithProgress(projectId);
  if (!budget) throw new ApiError(404, 'Este proyecto no tiene un presupuesto');
  const project = await Project.findByPk(projectId);
  const apuDataById = await buildApuDataByIdMap(items, budget);

  const { elaboroNombre, revisoNombre } = body;
  return { project, budget, items, apuDataById, elaboroNombre, revisoNombre };
}

// Consolidado de recursos de todo el proyecto (ver resourceConsolidationService.js): 4 listados
// (Materiales, Mano de Obra, Equipos y Herramientas, Transporte) recalculados siempre en vivo.
const getResourceConsolidation = asyncHandler(async (req, res) => {
  const result = await computeResourceConsolidation(req.params.projectId);
  res.json(result);
});

const exportResourceConsolidationPdf = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.projectId);
  const consolidation = await computeResourceConsolidation(req.params.projectId);
  const company = await getLetterheadForProject(req.params.projectId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="consolidado-recursos-${(project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`);
  const doc = generateResourceConsolidationPdf({ project, consolidation, company });
  doc.pipe(res);
});

const exportResourceConsolidationExcel = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.projectId);
  const consolidation = await computeResourceConsolidation(req.params.projectId);
  const buffer = await generateResourceConsolidationExcelBuffer({ project, consolidation });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="consolidado-recursos-${(project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx"`);
  res.send(buffer);
});

const exportPdf = asyncHandler(async (req, res) => {
  const ctx = await buildBudgetExportContext(req.params.projectId, req.body);
  const company = await getLetterheadForProject(req.params.projectId);
  const doc = generateBudgetWithApuAnnexPdf({ ...ctx, company });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${(ctx.project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`);
  doc.pipe(res);
});

const exportExcel = asyncHandler(async (req, res) => {
  const ctx = await buildBudgetExportContext(req.params.projectId, req.body);
  const company = await getLetterheadForProject(req.params.projectId);
  const buffer = await generateBudgetWithApuAnnexExcelBuffer({ ...ctx, company, exportDate: req.body.exportDate });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${(ctx.project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx"`);
  res.send(buffer);
});

module.exports = {
  getProjectBudget, createBudgetVersion, updateBudget, addItem, updateItem, removeItem, scanItemsFile, addItemsBulk,
  scanItemApuFile, addItemsWithApu, getItemApuDetail, importFromFile, exportPdf, exportExcel,
  getResourceConsolidation, exportResourceConsolidationPdf, exportResourceConsolidationExcel,
};
