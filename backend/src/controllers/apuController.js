const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { APU, APUComponent, PriceItem } = require('../models');
const { computeApuUnitCost } = require('../services/budgetService');

const list = asyncHandler(async (req, res) => {
  const apus = await APU.findAll({
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
    order: [['name', 'ASC']],
  });
  const withCosts = await Promise.all(apus.map(async (apu) => {
    const { directCost, unitCost } = await computeApuUnitCost(apu.id);
    return { ...apu.toJSON(), directCost, unitCost };
  }));
  res.json(withCosts);
});

const get = asyncHandler(async (req, res) => {
  const result = await computeApuUnitCost(req.params.id);
  if (!result) throw new ApiError(404, 'APU no encontrado');
  res.json({ ...result.apu.toJSON(), directCost: result.directCost, unitCost: result.unitCost });
});

const create = asyncHandler(async (req, res) => {
  const { name, unit, code, aiuPercent = 0, otherCosts = 0, components = [] } = req.body;
  if (!name || !unit) throw new ApiError(400, 'name y unit son obligatorios');
  if (Number(aiuPercent) < 0) throw new ApiError(400, 'aiuPercent no puede ser negativo');
  if (Number(otherCosts) < 0) throw new ApiError(400, 'otherCosts no puede ser negativo');

  const apu = await APU.create({ name, unit, code, aiuPercent, otherCosts });
  if (components.length) {
    await APUComponent.bulkCreate(
      components.map((c) => ({ apuId: apu.id, priceItemId: c.priceItemId, yield: c.yield }))
    );
  }
  const result = await computeApuUnitCost(apu.id);
  res.status(201).json({ ...result.apu.toJSON(), directCost: result.directCost, unitCost: result.unitCost });
});

const update = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id);
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  const { name, unit, code, aiuPercent, otherCosts } = req.body;
  if (name !== undefined) apu.name = name;
  if (unit !== undefined) apu.unit = unit;
  if (code !== undefined) apu.code = code;
  if (aiuPercent !== undefined) apu.aiuPercent = aiuPercent;
  if (otherCosts !== undefined) {
    if (Number(otherCosts) < 0) throw new ApiError(400, 'otherCosts no puede ser negativo');
    apu.otherCosts = otherCosts;
  }
  await apu.save();
  const result = await computeApuUnitCost(apu.id);
  res.json({ ...result.apu.toJSON(), directCost: result.directCost, unitCost: result.unitCost });
});

const remove = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id);
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  await apu.destroy();
  res.status(204).send();
});

const addComponent = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id);
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  const { priceItemId, yield: yieldValue } = req.body;
  if (!priceItemId || yieldValue === undefined) throw new ApiError(400, 'priceItemId y yield son obligatorios');
  if (Number(yieldValue) < 0) throw new ApiError(400, 'yield no puede ser negativo');
  const component = await APUComponent.create({ apuId: apu.id, priceItemId, yield: yieldValue });
  res.status(201).json(component);
});

const removeComponent = asyncHandler(async (req, res) => {
  const component = await APUComponent.findOne({ where: { id: req.params.componentId, apuId: req.params.id } });
  if (!component) throw new ApiError(404, 'Componente no encontrado');
  await component.destroy();
  res.status(204).send();
});

module.exports = { list, get, create, update, remove, addComponent, removeComponent };
