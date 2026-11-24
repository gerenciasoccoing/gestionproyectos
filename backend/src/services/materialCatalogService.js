// Catálogo de Materiales por categorías: deduplicación (ver especificación: "un material se
// considera el mismo si coinciden el nombre normalizado y la unidad"), búsqueda rápida para el
// selector de Órdenes de Compra, fusión de duplicados y eliminación con guardas. Punto único desde
// el que se crea un Material nuevo en TODA la app (Órdenes de Compra, borradores de IA e
// importación Excel pasan todos por `findOrCreateMaterial`), para que la regla de deduplicación
// viva en un solo lugar.
const { Op } = require('sequelize');
const {
  sequelize, Material, MaterialCategory, PurchaseOrderItem, PurchaseOrder, MaterialLot,
  MaterialTransferLine, MaterialIssueLine, MaterialReturnLine,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeMaterialText } = require('../utils/textNormalize');
const { nextMaterialCode } = require('./numberingService');

const SEARCH_LIMIT_DEFAULT = 20;

async function getDefaultCategory(transaction) {
  const category = await MaterialCategory.findOne({ where: { isDefault: true }, transaction });
  if (!category) throw new ApiError(500, 'La empresa no tiene categoría "Materiales" configurada');
  return category;
}

// Busca un material existente por nombre+unidad normalizados, o lo crea con la categoría
// "Materiales" por defecto — único punto de deduplicación de la app (ver comentario de arriba).
// No usa SELECT...FOR UPDATE: la colisión real bajo concurrencia (dos peticiones creando "lo
// mismo" al mismo tiempo) la resuelve el índice único (companyId, normalizedName, normalizedUnit) +
// el catch de abajo, más barato que bloquear la tabla completa en cada ítem de OC.
async function findOrCreateMaterial({ name, unit, origin = 'orden_compra', originPurchaseOrderId = null, transaction }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new ApiError(400, 'El nombre del material no puede estar vacío');
  const normalizedName = normalizeMaterialText(trimmedName);
  const normalizedUnit = normalizeMaterialText(unit || '');

  const existing = await Material.findOne({ where: { normalizedName, normalizedUnit }, transaction });
  if (existing) return existing;

  const category = await getDefaultCategory(transaction);
  const code = await nextMaterialCode(transaction);
  try {
    return await Material.create({
      name: trimmedName, unit: unit || null, categoryId: category.id, code, origin, originPurchaseOrderId,
    }, { transaction });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const winner = await Material.findOne({ where: { normalizedName, normalizedUnit }, transaction });
      if (winner) return winner;
    }
    throw err;
  }
}

// Último costo de compra por material (referencia para el selector/catálogo) — el ítem de OC más
// reciente por fecha de la orden (no por fecha de creación del registro: una OC puede cargarse
// después con fecha retroactiva). No distingue si ya se recibió o no: es el último PRECIO acordado,
// no el costo de un lote específico (eso ya lo resuelve el kardex, ver materialKardexService.js).
async function getLastPurchaseCosts(materialIds) {
  if (!materialIds.length) return new Map();
  const items = await PurchaseOrderItem.findAll({
    where: { materialId: materialIds },
    include: [{ model: PurchaseOrder, attributes: ['date'] }],
    order: [[{ model: PurchaseOrder }, 'date', 'DESC'], ['createdAt', 'DESC']],
  });
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.materialId)) map.set(item.materialId, { unitPrice: Number(item.unitPrice), date: item.PurchaseOrder?.date || null });
  }
  return map;
}

// Búsqueda del lado del servidor para el selector de la OC y el catálogo — por PREFIJO de nombre
// normalizado o de código (usa el índice de los dos, barato incluso con miles de materiales). Si el
// prefijo no encuentra nada, cae a una búsqueda "contiene" (sin índice, pero solo corre como
// respaldo) para poder sugerir "¿quisiste decir...?" ante una palabra intermedia o un typo leve.
async function searchMaterials({ q, categoryId, activeOnly = true, limit = SEARCH_LIMIT_DEFAULT } = {}) {
  const where = {};
  if (activeOnly) where.active = true;
  if (categoryId) where.categoryId = categoryId;

  const normalizedQuery = normalizeMaterialText(q || '');
  let materials = [];
  if (normalizedQuery) {
    materials = await Material.findAll({
      where: {
        ...where,
        [Op.or]: [
          { normalizedName: { [Op.like]: `${normalizedQuery}%` } },
          { code: { [Op.iLike]: `${q.trim()}%` } },
        ],
      },
      include: [{ model: MaterialCategory, as: 'category', attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
      limit,
    });
    if (!materials.length) {
      materials = await Material.findAll({
        where: { ...where, normalizedName: { [Op.like]: `%${normalizedQuery}%` } },
        include: [{ model: MaterialCategory, as: 'category', attributes: ['id', 'name'] }],
        order: [['name', 'ASC']],
        limit,
      });
    }
  } else {
    materials = await Material.findAll({
      where, include: [{ model: MaterialCategory, as: 'category', attributes: ['id', 'name'] }], order: [['name', 'ASC']], limit,
    });
  }

  const costs = await getLastPurchaseCosts(materials.map((m) => m.id));
  return materials.map((m) => ({
    id: m.id, code: m.code, name: m.name, unit: m.unit, categoryId: m.categoryId, categoryName: m.category?.name || null,
    // Último costo de compra real si ya tiene alguna OC; si no, el costo de referencia cargado a
    // mano o por Excel (ver Material.js#referenceCost) — nunca los dos a la vez.
    lastPurchaseCost: costs.get(m.id)?.unitPrice ?? (m.referenceCost != null ? Number(m.referenceCost) : null),
  }));
}

// Recategorización masiva (ver materialController.js#bulkRecategorize).
async function bulkRecategorize(materialIds, categoryId) {
  const category = await MaterialCategory.findByPk(categoryId);
  if (!category) throw new ApiError(400, 'Categoría no encontrada');
  const [count] = await Material.update({ categoryId }, { where: { id: materialIds } });
  return count;
}

// Un material solo se puede ELIMINAR (borrado real) si nunca se usó en ningún lado — ni en una OC
// (aunque sea de un ítem no inventariable que nunca llegó a generar un lote) ni en un movimiento de
// bodega. Si tiene cualquiera de esos, se ofrece desactivar en su lugar (ver la especificación:
// "si los tiene, se ofrece desactivarlo"), igual criterio que Warehouse.js (nunca expone un
// "eliminar" real sobre algo con historia).
async function assertMaterialDeletable(materialId) {
  const [poCount, lotCount, issueCount, transferCount, returnCount] = await Promise.all([
    PurchaseOrderItem.count({ where: { materialId } }),
    MaterialLot.count({ where: { materialId } }),
    MaterialIssueLine.count({ where: { materialId } }),
    MaterialTransferLine.count({ where: { materialId } }),
    MaterialReturnLine.count({ where: { materialId } }),
  ]);
  const inUse = poCount + lotCount + issueCount + transferCount + returnCount > 0;
  if (inUse) {
    throw new ApiError(409, 'Este material ya se usó en órdenes de compra o movimientos de bodega: no se puede eliminar. Puede desactivarlo en su lugar.');
  }
}

// Fusiona `loserMaterialId` dentro de `survivorMaterialId`: reasigna TODAS las referencias (ítems
// de OC y las 4 tablas de movimientos de bodega que guardan materialId propio) al material que se
// conserva, y desactiva al perdedor dejándolo apuntando a quien lo absorbió (ver
// Material.js#mergedIntoMaterialId) — nunca se borra, conserva la trazabilidad de qué pasó con ese
// código/nombre viejo. Una sola transacción: o se reasigna todo, o no se mueve nada.
async function mergeMaterials({ survivorMaterialId, loserMaterialId }) {
  if (survivorMaterialId === loserMaterialId) throw new ApiError(400, 'Debe elegir dos materiales distintos para fusionar');
  const survivor = await Material.findByPk(survivorMaterialId);
  const loser = await Material.findByPk(loserMaterialId);
  if (!survivor || !loser) throw new ApiError(404, 'Material no encontrado');
  if (loser.mergedIntoMaterialId) throw new ApiError(400, 'Ese material ya fue fusionado antes');

  await sequelize.transaction(async (t) => {
    await PurchaseOrderItem.update({ materialId: survivorMaterialId }, { where: { materialId: loserMaterialId }, transaction: t });
    await MaterialLot.update({ materialId: survivorMaterialId }, { where: { materialId: loserMaterialId }, transaction: t });
    await MaterialIssueLine.update({ materialId: survivorMaterialId }, { where: { materialId: loserMaterialId }, transaction: t });
    await MaterialTransferLine.update({ materialId: survivorMaterialId }, { where: { materialId: loserMaterialId }, transaction: t });
    await MaterialReturnLine.update({ materialId: survivorMaterialId }, { where: { materialId: loserMaterialId }, transaction: t });
    loser.active = false;
    loser.mergedIntoMaterialId = survivorMaterialId;
    await loser.save({ transaction: t });
  });

  return survivor;
}

module.exports = {
  getDefaultCategory, findOrCreateMaterial, getLastPurchaseCosts, searchMaterials,
  bulkRecategorize, assertMaterialDeletable, mergeMaterials,
};
