const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sequelize, APU, APUComponent, PriceItem } = require('../models');
const { computeApuUnitCost } = require('../services/budgetService');

// Valida y normaliza un componente recibido del formulario de APU (4 secciones) antes de guardarlo.
function sanitizeComponent(raw, index) {
  const category = raw.category;
  if (!APUComponent.CATEGORIES.includes(category)) {
    throw new ApiError(400, `Componente #${index + 1}: category inválida`);
  }
  if (category !== 'transporte' && !raw.priceItemId) {
    throw new ApiError(400, `Componente #${index + 1}: priceItemId es obligatorio`);
  }
  const quantity = Number(raw.quantity ?? 1);
  if (Number.isNaN(quantity) || quantity < 0) throw new ApiError(400, `Componente #${index + 1}: quantity inválida`);

  const component = {
    category,
    priceItemId: raw.priceItemId || null,
    description: raw.description || null,
    quantity,
    yield: raw.yield !== undefined && raw.yield !== '' ? Number(raw.yield) : 1,
    unitValue: raw.unitValue !== undefined && raw.unitValue !== '' ? Number(raw.unitValue) : null,
    prestacionalPercent: null,
    transportMode: null,
    transportDistance: null,
    transportPercent: null,
  };

  if (category === 'personal') {
    component.prestacionalPercent = Number(raw.prestacionalPercent ?? 0);
    if (Number.isNaN(component.prestacionalPercent) || component.prestacionalPercent < 0) {
      throw new ApiError(400, `Componente #${index + 1}: prestacionalPercent inválido`);
    }
  }

  if (category === 'transporte') {
    if (!APUComponent.TRANSPORT_MODES.includes(raw.transportMode)) {
      throw new ApiError(400, `Componente #${index + 1}: transportMode inválido`);
    }
    component.transportMode = raw.transportMode;
    if (!raw.priceItemId && (component.unitValue === null || component.unitValue < 0)) {
      if (raw.transportMode === 'distancia_peso') {
        throw new ApiError(400, `Componente #${index + 1}: unitValue (tarifa) o priceItemId es obligatorio`);
      }
    }
    if (raw.transportMode === 'distancia_peso') {
      component.transportDistance = Number(raw.transportDistance ?? 0);
      if (Number.isNaN(component.transportDistance) || component.transportDistance < 0) {
        throw new ApiError(400, `Componente #${index + 1}: transportDistance inválida`);
      }
    } else {
      component.transportPercent = Number(raw.transportPercent ?? 0);
      if (Number.isNaN(component.transportPercent) || component.transportPercent < 0) {
        throw new ApiError(400, `Componente #${index + 1}: transportPercent inválido`);
      }
    }
  }

  return component;
}

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

  const sanitized = components.map(sanitizeComponent);

  const apu = await sequelize.transaction(async (t) => {
    const created = await APU.create({ name, unit, code, aiuPercent, otherCosts }, { transaction: t });
    if (sanitized.length) {
      await APUComponent.bulkCreate(
        sanitized.map((c) => ({ ...c, apuId: created.id })),
        { transaction: t }
      );
    }
    return created;
  });

  const result = await computeApuUnitCost(apu.id);
  res.status(201).json({ ...result.apu.toJSON(), directCost: result.directCost, unitCost: result.unitCost, sections: result.sections });
});

const update = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id);
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  const { name, unit, code, aiuPercent, otherCosts, components } = req.body;
  if (name !== undefined) apu.name = name;
  if (unit !== undefined) apu.unit = unit;
  if (code !== undefined) apu.code = code;
  if (aiuPercent !== undefined) apu.aiuPercent = aiuPercent;
  if (otherCosts !== undefined) {
    if (Number(otherCosts) < 0) throw new ApiError(400, 'otherCosts no puede ser negativo');
    apu.otherCosts = otherCosts;
  }

  const sanitized = Array.isArray(components) ? components.map(sanitizeComponent) : null;

  await sequelize.transaction(async (t) => {
    await apu.save({ transaction: t });
    if (sanitized) {
      await APUComponent.destroy({ where: { apuId: apu.id }, transaction: t });
      if (sanitized.length) {
        await APUComponent.bulkCreate(
          sanitized.map((c) => ({ ...c, apuId: apu.id })),
          { transaction: t }
        );
      }
    }
  });

  const result = await computeApuUnitCost(apu.id);
  res.json({ ...result.apu.toJSON(), directCost: result.directCost, unitCost: result.unitCost, sections: result.sections });
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
