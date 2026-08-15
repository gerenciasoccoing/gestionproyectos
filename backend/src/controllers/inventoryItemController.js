const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { InventoryItem, InventoryCheckoutItem } = require('../models');
const { relativePath } = require('../middleware/upload');
const { getItemHistory, computeAvailableQuantity } = require('../services/inventoryService');

const TRACKING_TYPES = ['serializado', 'cantidad'];
const STATUSES = ['disponible', 'en_prestamo', 'mantenimiento', 'baja'];

// Agrega `available` (para "cantidad") calculado en vivo, sin persistirlo: a diferencia del costo
// de un APU, la disponibilidad de inventario depende de movimientos que cambian todo el tiempo y
// el catálogo no tiene el volumen (miles de filas) que justificó cachear directCost en APU.
async function withAvailability(item) {
  const json = item.toJSON();
  if (item.trackingType === 'cantidad') {
    json.available = await computeAvailableQuantity(item);
  }
  return json;
}

const list = asyncHandler(async (req, res) => {
  const { search, category, status } = req.query;
  const where = {};
  if (category) where.category = category;
  if (status) {
    if (!STATUSES.includes(status)) throw new ApiError(400, `status debe ser uno de: ${STATUSES.join(', ')}`);
    where.status = status;
  }
  const items = await InventoryItem.findAll({ where, order: [['name', 'ASC']] });
  const filtered = search
    ? items.filter((it) => {
      const q = search.toLowerCase();
      return it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q);
    })
    : items;
  res.json(await Promise.all(filtered.map(withAvailability)));
});

const get = asyncHandler(async (req, res) => {
  const item = await InventoryItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Equipo no encontrado');
  res.json(await withAvailability(item));
});

const history = asyncHandler(async (req, res) => {
  const data = await getItemHistory(req.params.id);
  res.json(data);
});

function validateBody({ name, code, category, trackingType, stockQuantity }) {
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  if (!code || !code.trim()) throw new ApiError(400, 'code es obligatorio');
  if (!category || !category.trim()) throw new ApiError(400, 'category es obligatoria');
  if (trackingType !== undefined && !TRACKING_TYPES.includes(trackingType)) {
    throw new ApiError(400, `trackingType debe ser uno de: ${TRACKING_TYPES.join(', ')}`);
  }
  if (trackingType === 'cantidad' && (stockQuantity === undefined || Number(stockQuantity) < 0)) {
    throw new ApiError(400, 'stockQuantity es obligatorio y no puede ser negativo para equipos de tipo "cantidad"');
  }
}

const create = asyncHandler(async (req, res) => {
  const { name, code, category, trackingType = 'serializado', value, stockQuantity, notes } = req.body;
  validateBody({ name, code, category, trackingType, stockQuantity });

  const existing = await InventoryItem.findOne({ where: { code: code.trim() } });
  if (existing) throw new ApiError(409, `Ya existe un equipo con el código "${code}": "${existing.name}"`);

  const item = await InventoryItem.create({
    name: name.trim(),
    code: code.trim(),
    category: category.trim(),
    trackingType,
    stockQuantity: trackingType === 'cantidad' ? stockQuantity : null,
    value: value || null,
    notes: notes || null,
    photoPath: relativePath(req.file),
    createdBy: req.user.id,
  });
  res.status(201).json(await withAvailability(item));
});

const update = asyncHandler(async (req, res) => {
  const item = await InventoryItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Equipo no encontrado');

  const { name, code, category, trackingType, value, stockQuantity, notes, status } = req.body;
  const nextTrackingType = trackingType !== undefined ? trackingType : item.trackingType;
  if (name !== undefined || code !== undefined || category !== undefined || trackingType !== undefined) {
    validateBody({
      name: name !== undefined ? name : item.name,
      code: code !== undefined ? code : item.code,
      category: category !== undefined ? category : item.category,
      trackingType: nextTrackingType,
      stockQuantity: stockQuantity !== undefined ? stockQuantity : item.stockQuantity,
    });
  }

  if (code !== undefined && code.trim() !== item.code) {
    const dup = await InventoryItem.findOne({ where: { code: code.trim() } });
    if (dup) throw new ApiError(409, `Ya existe un equipo con el código "${code}": "${dup.name}"`);
    item.code = code.trim();
  }
  if (name !== undefined) item.name = name.trim();
  if (category !== undefined) item.category = category.trim();
  if (trackingType !== undefined) item.trackingType = trackingType;
  if (value !== undefined) item.value = value || null;
  if (stockQuantity !== undefined) item.stockQuantity = stockQuantity;
  if (notes !== undefined) item.notes = notes || null;
  // Cambio manual de estado (ej. marcar "en mantenimiento"/"dado de baja" sin pasar por una
  // devolución, o reactivar un equipo serializado a "disponible"). Solo aplica directo para
  // "serializado"; en "cantidad" el estado no gobierna la disponibilidad (ver withAvailability).
  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw new ApiError(400, `status debe ser uno de: ${STATUSES.join(', ')}`);
    item.status = status;
  }
  if (req.file) item.photoPath = relativePath(req.file);

  await item.save();
  res.json(await withAvailability(item));
});

const remove = asyncHandler(async (req, res) => {
  const item = await InventoryItem.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Equipo no encontrado');
  if (item.status === 'en_prestamo') throw new ApiError(400, 'No se puede eliminar un equipo que está actualmente en préstamo');
  // La FK de InventoryCheckoutItem.inventoryItemId es NOT NULL, así que Sequelize la crea con
  // ON DELETE CASCADE por defecto: borrar el equipo borraría en cascada todo su historial de
  // salidas/entradas. El historial debe quedar guardado y consultable, así que se bloquea el
  // borrado si el equipo ya tuvo algún movimiento (no solo si está en préstamo ahora mismo).
  const hasHistory = await InventoryCheckoutItem.count({ where: { inventoryItemId: item.id } });
  if (hasHistory > 0) {
    throw new ApiError(400, 'No se puede eliminar un equipo con historial de movimientos (tuvo salidas registradas). Puedes marcarlo como "dado de baja" en su lugar.');
  }
  await item.destroy();
  res.status(204).send();
});

module.exports = { list, get, history, create, update, remove };
