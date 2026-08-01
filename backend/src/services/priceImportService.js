const { sequelize, PriceItem, PriceHistory } = require('../models');

const VALID_TYPES = ['material', 'mano_obra', 'equipo'];

function stripAccents(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeKey(key) {
  return stripAccents(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Acepta encabezados en español con o sin tildes/espacios: "Tipo", "Nombre", "Unidad", "Valor".
const COLUMN_ALIASES = {
  tipo: 'type', type: 'type',
  nombre: 'name', name: 'name',
  unidad: 'unit', unit: 'unit',
  valor: 'currentValue', valorunitario: 'currentValue', currentvalue: 'currentValue', value: 'currentValue',
};

function normalizeType(raw) {
  const key = normalizeKey(raw);
  if (VALID_TYPES.includes(raw)) return raw;
  if (key === 'material' || key === 'materiales') return 'material';
  if (key === 'manodeobra' || key === 'manoobra') return 'mano_obra';
  if (key === 'equipo' || key === 'maquinaria' || key === 'equipomaquinaria') return 'equipo';
  return null;
}

function mapRow(rawRow) {
  const mapped = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const alias = COLUMN_ALIASES[normalizeKey(key)];
    if (alias) mapped[alias] = value;
  }
  return mapped;
}

// Procesa las filas ya parseadas (ver excelParseService) y crea/actualiza la base de precios.
// No aborta ante una fila inválida: la reporta y continúa con las demás.
async function importPriceItemsFromRows(rows, effectiveDate) {
  const existing = await PriceItem.findAll();
  const findExisting = (type, name) => existing.find(
    (item) => item.type === type && stripAccents(item.name).toLowerCase().trim() === stripAccents(name).toLowerCase().trim()
  );

  const result = { created: 0, updated: 0, errors: [] };
  const today = effectiveDate || new Date().toISOString().slice(0, 10);

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // fila 1 = encabezados
    const row = mapRow(rows[i]);
    const type = normalizeType(row.type);
    const name = row.name ? String(row.name).trim() : '';
    const unit = row.unit ? String(row.unit).trim() : '';
    const currentValue = Number(row.currentValue);

    if (!type) { result.errors.push({ row: rowNumber, message: `Tipo inválido: "${row.type}" (debe ser material, mano_obra o equipo)` }); continue; }
    if (!name) { result.errors.push({ row: rowNumber, message: 'Falta el nombre' }); continue; }
    if (!unit) { result.errors.push({ row: rowNumber, message: 'Falta la unidad' }); continue; }
    if (!Number.isFinite(currentValue) || currentValue < 0) { result.errors.push({ row: rowNumber, message: `Valor inválido: "${row.currentValue}"` }); continue; }

    try {
      await sequelize.transaction(async (t) => {
        const match = findExisting(type, name);
        if (match) {
          match.currentValue = currentValue;
          match.unit = unit;
          await match.save({ transaction: t });
          await PriceHistory.create({ priceItemId: match.id, value: currentValue, effectiveDate: today }, { transaction: t });
          result.updated += 1;
        } else {
          const created = await PriceItem.create({ type, name, unit, currentValue }, { transaction: t });
          await PriceHistory.create({ priceItemId: created.id, value: currentValue, effectiveDate: today }, { transaction: t });
          existing.push(created);
          result.created += 1;
        }
      });
    } catch (err) {
      result.errors.push({ row: rowNumber, message: err.message });
    }
  }

  return result;
}

module.exports = { importPriceItemsFromRows, VALID_TYPES };
