const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { BudgetItem, ProgressEntry, ProgressPhoto } = require('../models');
const { relativePath } = require('../middleware/upload');

async function assertItemBelongsToProject(itemId, projectId) {
  const item = await BudgetItem.findByPk(itemId, { include: [{ association: 'Budget' }] });
  if (!item || item.Budget.projectId !== projectId) throw new ApiError(404, 'Ítem de presupuesto no encontrado en este proyecto');
  return item;
}

const listEntries = asyncHandler(async (req, res) => {
  const item = await assertItemBelongsToProject(req.params.itemId, req.params.projectId);
  const entries = await ProgressEntry.findAll({
    where: { budgetItemId: item.id },
    include: [{ model: ProgressPhoto, as: 'photos' }],
    order: [['date', 'DESC']],
  });
  res.json(entries);
});

const createEntry = asyncHandler(async (req, res) => {
  const item = await assertItemBelongsToProject(req.params.itemId, req.params.projectId);

  const { date, quantityExecuted, notes } = req.body;
  if (!date || quantityExecuted === undefined) throw new ApiError(400, 'date y quantityExecuted son obligatorios');
  if (Number(quantityExecuted) < 0) throw new ApiError(400, 'La cantidad ejecutada no puede ser negativa');

  const existing = await ProgressEntry.findAll({ where: { budgetItemId: item.id } });
  const accumulatedBefore = existing.reduce((sum, e) => sum + Number(e.quantityExecuted), 0);
  const accumulatedAfter = accumulatedBefore + Number(quantityExecuted);

  const entry = await ProgressEntry.create({
    budgetItemId: item.id,
    date,
    quantityExecuted,
    notes,
    createdBy: req.user.id,
  });

  const files = req.files || [];
  const photos = await Promise.all(
    files.map((f) => ProgressPhoto.create({ progressEntryId: entry.id, filePath: relativePath(f) }))
  );

  const warning = accumulatedAfter > Number(item.quantity)
    ? `La cantidad ejecutada acumulada (${accumulatedAfter}) supera la cantidad presupuestada (${item.quantity}).`
    : null;

  res.status(201).json({ ...entry.toJSON(), photos, warning });
});

const removeEntry = asyncHandler(async (req, res) => {
  await assertItemBelongsToProject(req.params.itemId, req.params.projectId);
  const entry = await ProgressEntry.findOne({ where: { id: req.params.entryId, budgetItemId: req.params.itemId } });
  if (!entry) throw new ApiError(404, 'Registro de avance no encontrado');
  await entry.destroy();
  res.status(204).send();
});

module.exports = { listEntries, createEntry, removeEntry };
