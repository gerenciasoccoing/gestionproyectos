const XLSX = require('xlsx');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sequelize, PriceItem, PriceHistory } = require('../models');
const { parseExcelSafely } = require('../services/excelParseService');
const { importPriceItemsFromRows } = require('../services/priceImportService');
const { recomputeApuCostsForPriceItems } = require('../services/budgetService');

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
  const { type, code, name, unit, currentValue } = req.body;
  if (!['material', 'mano_obra', 'equipo'].includes(type)) throw new ApiError(400, 'type debe ser material, mano_obra o equipo');
  if (!name || !unit || currentValue === undefined) throw new ApiError(400, 'name, unit y currentValue son obligatorios');
  if (Number(currentValue) < 0) throw new ApiError(400, 'currentValue no puede ser negativo');

  const item = await sequelize.transaction(async (t) => {
    const created = await PriceItem.create({ type, code, name, unit, currentValue }, { transaction: t });
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
    // El nuevo precio puede afectar el costo cacheado de cualquier APU que use este insumo.
    await recomputeApuCostsForPriceItems([item.id], t);
  });
  res.json(item);
});

const update = asyncHandler(async (req, res) => {
  const item = await PriceItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Ítem de precio no encontrado');
  const { name, unit, type, code } = req.body;
  if (name !== undefined) item.name = name;
  if (unit !== undefined) item.unit = unit;
  if (type !== undefined) item.type = type;
  if (code !== undefined) item.code = code;
  await item.save();
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  const item = await PriceItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Ítem de precio no encontrado');
  await item.destroy();
  res.status(204).send();
});

// Importación masiva desde Excel: crea ítems nuevos y actualiza el valor de los existentes
// (mismo tipo + nombre), reportando fila por fila los errores sin abortar el resto.
const importExcel = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo Excel (.xlsx o .xls)');

  const rows = await parseExcelSafely(req.file.buffer);
  if (!rows.length) throw new ApiError(400, 'El archivo no contiene filas de datos');

  const result = await importPriceItemsFromRows(rows, req.body.effectiveDate);
  res.json(result);
});

// Plantilla de ejemplo para que el usuario complete y luego importe.
const downloadTemplate = asyncHandler(async (req, res) => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Codigo', 'Tipo', 'Nombre', 'Unidad', 'Valor'],
    ['04.11.001', 'material', 'Cemento gris', 'bulto 50kg', 35000],
    ['MO0011', 'mano_obra', 'Oficial de construcción', 'jornal', 80000],
    ['EQ001', 'equipo', 'Retroexcavadora', 'hora', 120000],
  ]);
  worksheet['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Base de Precios');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-base-precios.xlsx"');
  res.send(buffer);
});

module.exports = { list, get, create, update, updateValue, remove, importExcel, downloadTemplate };
