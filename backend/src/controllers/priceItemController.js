const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sequelize, PriceItem, PriceHistory } = require('../models');

const list = asyncHandler(async (req, res) => {
  const items = await PriceItem.findAll({ order: [['name', 'ASC']] });
  res.json(items);
});

const get = asyncHandler(async (req, res) => {
  const item = await PriceItem.findByPk(req.params.id, {
    include: [{ model: PriceHistory, as: 'history', separate: true, order: [['effectiveDate', 'DESC']] }],
  });
  if (!item) throw new ApiError(404, 'Ítem de precio no encontrado');
  res.json(item);
});

const create = asyncHandler(async (req, res) => {
  const { type, name, unit, currentValue } = req.body;
  if (!['material', 'mano_obra', 'equipo'].includes(type)) throw new ApiError(400, 'type debe ser material, mano_obra o equipo');
  if (!name || !unit || currentValue === undefined) throw new ApiError(400, 'name, unit y currentValue son obligatorios');
  if (Number(currentValue) < 0) throw new ApiError(400, 'currentValue no puede ser negativo');

  const item = await sequelize.transaction(async (t) => {
    const created = await PriceItem.create({ type, name, unit, currentValue }, { transaction: t });
    await PriceHistory.create({
      priceItemId: created.id, value: currentValue, effectiveDate: new Date().toISOString().slice(0, 10),
    }, { transaction: t });
    return created;
  });
  res.status(201).json(item);
});

// Actualizar el valor genera automáticamente una entrada en el historial de precios.
const updateValue = asyncHandler(async (req, res) => {
  const item = await PriceItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Ítem de precio no encontrado');
  const { currentValue, effectiveDate } = req.body;
  if (currentValue === undefined || Number(currentValue) < 0) throw new ApiError(400, 'currentValue no puede ser negativo');

  await sequelize.transaction(async (t) => {
    item.currentValue = currentValue;
    await item.save({ transaction: t });
    await PriceHistory.create({
      priceItemId: item.id,
      value: currentValue,
      effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
    }, { transaction: t });
  });
  res.json(item);
});

const update = asyncHandler(async (req, res) => {
  const item = await PriceItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Ítem de precio no encontrado');
  const { name, unit, type } = req.body;
  if (name !== undefined) item.name = name;
  if (unit !== undefined) item.unit = unit;
  if (type !== undefined) item.type = type;
  await item.save();
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  const item = await PriceItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Ítem de precio no encontrado');
  await item.destroy();
  res.status(204).send();
});

module.exports = { list, get, create, update, updateValue, remove };
