const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  Budget, BudgetItem, APU, APUComponent, PriceItem, Project,
} = require('../models');
const { computeApuUnitCost, applyBudgetAiu, getBudgetItemsWithProgress } = require('../services/budgetService');
const { importBudgetFromWorkbook } = require('../services/budgetImportService');
const { buildApuExportData } = require('../services/apuExportService');
const { generateBudgetWithApuAnnexPdf } = require('../services/pdfService');
const { generateBudgetWithApuAnnexExcelBuffer } = require('../services/apuExcelExportService');
const { getSettingsForPdf } = require('./companySettingsController');

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

  const { apuId, description, unit, quantity } = req.body;
  if (!description || !unit || quantity === undefined) {
    throw new ApiError(400, 'description, unit y quantity son obligatorios');
  }
  if (Number(quantity) < 0) throw new ApiError(400, 'La cantidad no puede ser negativa');

  let unitCost = req.body.unitCost || 0;
  if (apuId) {
    const result = await computeApuUnitCost(apuId);
    if (!result) throw new ApiError(404, 'APU no encontrado');
    unitCost = applyBudgetAiu(result.directCost, budget);
  }

  const item = await BudgetItem.create({
    budgetId: budget.id,
    apuId: apuId || null,
    description,
    unit,
    quantity,
    unitCost,
    totalCost: Number(quantity) * Number(unitCost),
  });
  res.status(201).json(item);
});

const removeItem = asyncHandler(async (req, res) => {
  const item = await BudgetItem.findOne({ where: { id: req.params.itemId, budgetId: req.params.budgetId } });
  if (!item) throw new ApiError(404, 'Ítem de presupuesto no encontrado');
  await item.destroy();
  res.status(204).send();
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

  const apuIds = [...new Set(items.filter((it) => it.apuId).map((it) => it.apuId))];
  const apus = await APU.findAll({
    where: { id: apuIds },
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  const aiu = { adminPercent: budget.adminPercent, imprevistosPercent: budget.imprevistosPercent, utilidadPercent: budget.utilidadPercent };
  const apuDataById = new Map(apus.map((apu) => [apu.id, buildApuExportData(apu, aiu)]));

  const { elaboroNombre, revisoNombre } = body;
  return { project, budget, items, apuDataById, elaboroNombre, revisoNombre };
}

const exportPdf = asyncHandler(async (req, res) => {
  const ctx = await buildBudgetExportContext(req.params.projectId, req.body);
  const company = await getSettingsForPdf();
  const doc = generateBudgetWithApuAnnexPdf({ ...ctx, company });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${(ctx.project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`);
  doc.pipe(res);
});

const exportExcel = asyncHandler(async (req, res) => {
  const ctx = await buildBudgetExportContext(req.params.projectId, req.body);
  const buffer = generateBudgetWithApuAnnexExcelBuffer(ctx);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${(ctx.project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx"`);
  res.send(buffer);
});

module.exports = {
  getProjectBudget, createBudgetVersion, updateBudget, addItem, removeItem, importFromFile, exportPdf, exportExcel,
};
