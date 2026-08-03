const { sequelize, PriceItem, PriceHistory } = require('../models');

const VALID_TYPES = ['material', 'mano_obra', 'equipo'];
const BATCH_SIZE = 500;

function stripAccents(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeKey(key) {
  return stripAccents(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeName(name) {
  return stripAccents(name).toLowerCase().trim();
}

// Acepta encabezados en español con o sin tildes/espacios.
const COLUMN_ALIASES = {
  codigo: 'code', code: 'code',
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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Procesa las filas ya parseadas (ver excelParseService) y crea/actualiza la base de precios.
// Coincidencia: por "code" si viene informado y ya existe; si no, por tipo+nombre; si no hay
// coincidencia, crea un ítem nuevo. Si el mismo código/nombre se repite varias veces dentro del
// propio archivo, se queda con la última ocurrencia válida (no crea duplicados entre sí).
// No aborta ante una fila inválida: la reporta y sigue. Pensado para lotes grandes (miles de
// filas): agrupa creaciones y actualizaciones para no abrir una operación por fila.
async function importPriceItemsFromRows(rows, effectiveDate) {
  const existing = await PriceItem.findAll();
  const existingByCode = new Map(existing.filter((i) => i.code).map((i) => [i.code, i]));
  const existingByTypeName = new Map(existing.map((i) => [`${i.type}::${normalizeName(i.name)}`, i]));

  const result = { created: 0, updated: 0, errors: [] };
  const today = effectiveDate || new Date().toISOString().slice(0, 10);

  // key -> { existingItem|null, type, code, name, unit, currentValue }
  const resolved = new Map();

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // fila 1 = encabezados
    const row = mapRow(rows[i]);
    const type = normalizeType(row.type);
    const code = row.code ? String(row.code).trim() : null;
    const name = row.name ? String(row.name).trim() : '';
    const unit = row.unit ? String(row.unit).trim() : '';
    const currentValue = Number(row.currentValue);

    if (!type) { result.errors.push({ row: rowNumber, message: `Tipo inválido: "${row.type}" (debe ser material, mano_obra o equipo)` }); continue; }
    if (!name) { result.errors.push({ row: rowNumber, message: 'Falta el nombre' }); continue; }
    if (!unit) { result.errors.push({ row: rowNumber, message: 'Falta la unidad' }); continue; }
    if (!Number.isFinite(currentValue) || currentValue < 0) { result.errors.push({ row: rowNumber, message: `Valor inválido: "${row.currentValue}"` }); continue; }

    const existingItem = (code && existingByCode.get(code)) || existingByTypeName.get(`${type}::${normalizeName(name)}`) || null;
    const key = code || `${type}::${normalizeName(name)}`;
    resolved.set(key, { existingItem, type, code, name, unit, currentValue });
  }

  const toCreate = [];
  const toUpdate = [];
  for (const entry of resolved.values()) {
    if (entry.existingItem) toUpdate.push(entry);
    else toCreate.push(entry);
  }

  await sequelize.transaction(async (t) => {
    for (const batch of chunk(toCreate, BATCH_SIZE)) {
      const created = await PriceItem.bulkCreate(
        batch.map((r) => ({ type: r.type, code: r.code, name: r.name, unit: r.unit, currentValue: r.currentValue })),
        { transaction: t, returning: true }
      );
      await PriceHistory.bulkCreate(
        created.map((item) => ({ priceItemId: item.id, value: item.currentValue, effectiveDate: today })),
        { transaction: t }
      );
      result.created += created.length;
    }

    for (const batch of chunk(toUpdate, BATCH_SIZE)) {
      for (const u of batch) {
        u.existingItem.currentValue = u.currentValue;
        u.existingItem.unit = u.unit;
        if (u.code) u.existingItem.code = u.code;
        await u.existingItem.save({ transaction: t });
      }
      await PriceHistory.bulkCreate(
        batch.map((u) => ({ priceItemId: u.existingItem.id, value: u.currentValue, effectiveDate: today })),
        { transaction: t }
      );
      result.updated += batch.length;
    }
  });

  return result;
}

module.exports = { importPriceItemsFromRows, VALID_TYPES };
