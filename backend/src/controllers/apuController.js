const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sequelize, APU, APUComponent, PriceItem, PriceListImport, APUPriceHistory } = require('../models');
const { computeApuUnitCost, recomputeAndPersistApuCost } = require('../services/budgetService');
const { importApuCatalog } = require('../services/apuCatalogImportService');
const { generateApuPdf } = require('../services/pdfService');
const { generateApuExcelBuffer } = require('../services/apuExcelExportService');
const { getSettingsForPdf } = require('./companySettingsController');

// AIU (Administración/Imprevistos/Utilidad) y los nombres de firma son parámetros del momento de
// exportar: no se guardan en el APU (el AIU real de un proyecto/cotización vive en Budget).
function parseExportParams(body) {
  const { adminPercent = 0, imprevistosPercent = 0, utilidadPercent = 0, elaboroNombre, revisoNombre, itemLabel } = body;
  for (const [label, value] of [['adminPercent', adminPercent], ['imprevistosPercent', imprevistosPercent], ['utilidadPercent', utilidadPercent]]) {
    if (Number(value) < 0) throw new ApiError(400, `${label} no puede ser negativo`);
  }
  return { aiu: { adminPercent, imprevistosPercent, utilidadPercent }, elaboroNombre, revisoNombre, itemLabel };
}

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
    wastePercent: null,
    transportMode: null,
    transportDistance: null,
    transportPercent: null,
  };

  if (category === 'material') {
    component.wastePercent = raw.wastePercent !== undefined && raw.wastePercent !== '' ? Number(raw.wastePercent) : 0;
    if (Number.isNaN(component.wastePercent) || component.wastePercent < 0) {
      throw new ApiError(400, `Componente #${index + 1}: wastePercent (% desperdicio) inválido`);
    }
  }

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

// Lee el costo directo ya cacheado en APU.directCost (ver budgetService.recomputeAndPersistApuCost)
// en vez de recalcularlo leyendo todos los componentes de cada APU: con miles de APU y varios
// componentes cada uno, ese JOIN (antes hecho en cada consulta, aunque fuera un solo query) era el
// cuello de botella real de esta pantalla. No incluye el detalle de componentes en la respuesta:
// para eso está GET /apus/:id, que sí los trae.
const list = asyncHandler(async (req, res) => {
  const apus = await APU.findAll({ order: [['name', 'ASC']] });
  const withCosts = apus.map((apu) => {
    const directCost = Number(apu.directCost);
    return { ...apu.toJSON(), directCost, unitCost: directCost };
  });
  res.json(withCosts);
});

const get = asyncHandler(async (req, res) => {
  const result = await computeApuUnitCost(req.params.id);
  if (!result) throw new ApiError(404, 'APU no encontrado');
  res.json({ ...result.apu.toJSON(), directCost: result.directCost, unitCost: result.unitCost });
});

const create = asyncHandler(async (req, res) => {
  const { name, unit, code, otherCosts = 0, components = [] } = req.body;
  if (!name || !unit) throw new ApiError(400, 'name y unit son obligatorios');
  if (Number(otherCosts) < 0) throw new ApiError(400, 'otherCosts no puede ser negativo');

  const sanitized = components.map(sanitizeComponent);

  const apu = await sequelize.transaction(async (t) => {
    const created = await APU.create({ name, unit, code, otherCosts }, { transaction: t });
    if (sanitized.length) {
      await APUComponent.bulkCreate(
        sanitized.map((c) => ({ ...c, apuId: created.id })),
        { transaction: t }
      );
    }
    return created;
  });

  const result = await recomputeAndPersistApuCost(apu.id);
  res.status(201).json({ ...result.apu.toJSON(), directCost: result.directCost, unitCost: result.unitCost, sections: result.sections });
});

const update = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id);
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  const { name, unit, code, otherCosts, components } = req.body;
  if (name !== undefined) apu.name = name;
  if (unit !== undefined) apu.unit = unit;
  if (code !== undefined) apu.code = code;
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

  const result = await recomputeAndPersistApuCost(apu.id);
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
  await recomputeAndPersistApuCost(apu.id);
  res.status(201).json(component);
});

const removeComponent = asyncHandler(async (req, res) => {
  const component = await APUComponent.findOne({ where: { id: req.params.componentId, apuId: req.params.id } });
  if (!component) throw new ApiError(404, 'Componente no encontrado');
  await component.destroy();
  await recomputeAndPersistApuCost(req.params.id);
  res.status(204).send();
});

// Carga/actualización masiva del catálogo de APU desde un Excel con el formato del listado
// oficial de precios unitarios (hojas "Items de Presupuesto" + "Unitarios"). APU nuevo (código no
// existente) se crea; APU existente (mismo código) se actualiza si su costo cambió, sin tocar
// ningún BudgetItem que ya lo referencie (su valor queda fijo, ver budgetController.addItem).
// Devuelve el resumen y la lista de APU que cambiaron de valor, con cuántos BudgetItem existentes
// los referencian, para que el usuario revise el impacto antes de decidir qué hacer.
const importCatalog = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo Excel (.xlsx o .xls)');
  const { sourceLabel, effectiveDate } = req.body;
  const result = await importApuCatalog({
    buffer: req.file.buffer,
    sourceLabel,
    effectiveDate,
    fileName: req.file.originalname,
    userId: req.user.id,
  });
  res.status(201).json(result);
});

// Historial de lotes de importación del catálogo (para saber cuándo se cargó cada listado).
const listImports = asyncHandler(async (req, res) => {
  const imports = await PriceListImport.findAll({ order: [['createdAt', 'DESC']] });
  res.json(imports);
});

// Histórico de costo directo de un APU en el tiempo (creación + cada actualización de listado).
const priceHistory = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id);
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  const history = await APUPriceHistory.findAll({
    where: { apuId: apu.id },
    include: [{ model: PriceListImport }],
    order: [['effectiveDate', 'ASC'], ['createdAt', 'ASC']],
  });
  res.json(history);
});

// Exporta un APU individual en el formato del modelo (ver drawApuAnalysis en pdfService.js).
// AIU y los nombres de "Elaboró y validó"/"Revisó y Aprobó" se digitan en el momento de exportar
// (no persisten): se reciben en el body de esta misma petición.
const exportPdf = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id, {
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  const { aiu, elaboroNombre, revisoNombre, itemLabel } = parseExportParams(req.body);
  const company = await getSettingsForPdf();

  const doc = generateApuPdf({ apu, aiu, elaboroNombre, revisoNombre, itemLabel, company });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="apu-${(apu.code || apu.id).replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`);
  doc.pipe(res);
});

const exportExcel = asyncHandler(async (req, res) => {
  const apu = await APU.findByPk(req.params.id, {
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  if (!apu) throw new ApiError(404, 'APU no encontrado');
  const { aiu, elaboroNombre, revisoNombre, itemLabel } = parseExportParams(req.body);
  const company = await getSettingsForPdf();

  const buffer = await generateApuExcelBuffer({ apu, aiu, elaboroNombre, revisoNombre, itemLabel, company, exportDate: req.body.exportDate });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="apu-${(apu.code || apu.id).replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx"`);
  res.send(buffer);
});

module.exports = {
  list, get, create, update, remove, addComponent, removeComponent, importCatalog, listImports, priceHistory,
  exportPdf, exportExcel,
};
