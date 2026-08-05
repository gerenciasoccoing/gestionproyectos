const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Budget, BudgetItem } = require('../models');
const { computeApuUnitCost, applyBudgetAiu, getBudgetItemsWithProgress } = require('../services/budgetService');

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

module.exports = { getProjectBudget, createBudgetVersion, updateBudget, addItem, removeItem };
