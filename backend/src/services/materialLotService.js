const ApiError = require('../utils/ApiError');
const { Material, MaterialLot, Warehouse } = require('../models');
const { findOrCreateMaterial } = require('./materialCatalogService');

// Resuelve el Material del catálogo a partir del nombre del ítem de la OC — se auto-crea (o se
// empareja por nombre+unidad normalizados, ver materialCatalogService.js#findOrCreateMaterial) la
// primera vez que se usa, así nunca hay que pedirle al usuario que mantenga un catálogo aparte
// antes de poder recibir algo. Se llama al crear o editar un ítem inventariable de una Orden de
// Compra (purchaseOrderController.js#resolveNewItemMaterial), no en cada recepción: el ítem ya
// "sabe" su materialId para cuando llegue a recibirse. Firma sin cambios a propósito (mismo call
// site de siempre); la deduplicación real vive en materialCatalogService.js.
async function findOrCreateMaterialByName(name, unit, transaction, originPurchaseOrderId = null) {
  return findOrCreateMaterial({ name, unit, origin: 'orden_compra', originPurchaseOrderId, transaction });
}

async function getDefaultWarehouse(transaction) {
  const warehouse = await Warehouse.findOne({ where: { isDefault: true }, transaction });
  if (!warehouse) throw new ApiError(500, 'La empresa no tiene Bodega Principal configurada');
  return warehouse;
}

async function assertWarehouseUsable(warehouseId, { transaction } = {}) {
  const warehouse = await Warehouse.findByPk(warehouseId, { transaction });
  if (!warehouse) throw new ApiError(400, 'Bodega no encontrada');
  if (!warehouse.active) throw new ApiError(400, `La bodega "${warehouse.name}" está inactiva`);
  return warehouse;
}

// Crea el lote de una recepción de OC (ver purchaseOrderController.js#addReceipt) — el costo
// unitario SIEMPRE es item.unitPrice (el costo exacto de ESA orden), nunca un promedio. Si el
// ítem no tiene materialId resuelto (no debería pasar si inventariable:true, pero se protege
// igual), lanza en vez de crear un lote huérfano sin material.
async function createLotFromReceipt({ item, order, receipt, warehouse, date, quantityReceived, userId, transaction }) {
  if (!item.materialId) throw new ApiError(400, 'Este ítem no tiene un material resuelto en el catálogo');
  return MaterialLot.create({
    warehouseId: warehouse.id,
    materialId: item.materialId,
    sourceType: 'recepcion_oc',
    purchaseOrderId: order.id,
    purchaseOrderItemId: item.id,
    purchaseReceiptId: receipt.id,
    supplierId: order.supplierId || null,
    unit: item.unit,
    quantityReceived,
    quantityAvailable: quantityReceived,
    unitCost: item.unitPrice,
    receivedDate: date,
    createdBy: userId,
  }, { transaction });
}

// Ajusta el lote nacido de una recepción cuando un administrador corrige quantityReceived (ver
// purchaseOrderController.js#updateReceipt) — aplica el MISMO delta a quantityReceived y
// quantityAvailable (histórico y disponible se mueven juntos: la corrección es sobre lo que
// realmente entró, no sobre lo que ya salió). Bloquea con un mensaje claro si el delta dejaría la
// disponibilidad en negativo (ya salió más de lo que quedaría recibido) — "el sistema... advierte y
// no permite dejar el lote en negativo", ver especificación de la tarea. SELECT...FOR UPDATE
// (lock de fila) para que una corrección y una salida/traslado simultáneos sobre el MISMO lote
// nunca puedan cruzarse y dejarlo negativo igual.
async function adjustLotForReceiptCorrection({ receiptId, newQuantityReceived, transaction }) {
  const lot = await MaterialLot.findOne({
    where: { purchaseReceiptId: receiptId }, transaction, lock: transaction.LOCK.UPDATE,
  });
  if (!lot) return null; // ítem no inventariable: nunca tuvo lote, nada que ajustar.

  const delta = Number(newQuantityReceived) - Number(lot.quantityReceived);
  const nextAvailable = Number(lot.quantityAvailable) + delta;
  if (nextAvailable < 0) {
    const alreadyOut = Number(lot.quantityReceived) - Number(lot.quantityAvailable);
    throw new ApiError(400, `No se puede corregir a ${newQuantityReceived}: de este lote ya salieron ${alreadyOut} unidades, así que la cantidad recibida no puede bajar de ${alreadyOut}.`);
  }
  lot.quantityReceived = newQuantityReceived;
  lot.quantityAvailable = nextAvailable;
  await lot.save({ transaction });
  return lot;
}

// Consume stock de una bodega para un material, en PEPS (lote más antiguo primero) o de un lote
// elegido a mano (manualLotId) — usado por traslados (Fase 3), salidas (Fase 4) y para que una
// devolución a la MISMA bodega reponga directamente su lote de origen (Fase 5). Devuelve una línea
// por cada lote tocado (si hacen falta varios para completar `quantity`, son varias líneas, cada
// una con SU costo exacto — nunca se promedia). SELECT...FOR UPDATE bloquea cada lote tocado
// dentro de la transacción, así que dos movimientos simultáneos sobre el mismo lote nunca pueden
// sobregirar su quantityAvailable (ver especificación: "operaciones de stock transaccionales, con
// bloqueo de lote").
async function consumeLotsPeps({ warehouseId, materialId, quantity, manualLotId, transaction }) {
  let remaining = Number(quantity);
  if (remaining <= 0) throw new ApiError(400, 'La cantidad a consumir debe ser mayor a 0');
  const consumed = [];

  if (manualLotId) {
    const lot = await MaterialLot.findOne({
      where: { id: manualLotId, warehouseId, materialId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!lot) throw new ApiError(400, 'El lote elegido no existe en esa bodega para ese material');
    if (Number(lot.quantityAvailable) < remaining) {
      throw new ApiError(400, `El lote elegido solo tiene ${lot.quantityAvailable} disponibles (se pidieron ${remaining})`);
    }
    lot.quantityAvailable = Number(lot.quantityAvailable) - remaining;
    await lot.save({ transaction });
    consumed.push({ lotId: lot.id, quantity: remaining, unitCost: Number(lot.unitCost) });
    return consumed;
  }

  const lots = await MaterialLot.findAll({
    where: { warehouseId, materialId },
    order: [['receivedDate', 'ASC'], ['createdAt', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.quantityAvailable);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    lot.quantityAvailable = available - take;
    // eslint-disable-next-line no-await-in-loop
    await lot.save({ transaction });
    consumed.push({ lotId: lot.id, quantity: take, unitCost: Number(lot.unitCost) });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new ApiError(400, `No hay suficiente existencia disponible de este material en esta bodega (faltan ${remaining})`);
  }
  return consumed;
}

// Crea el lote nuevo en la bodega destino de un traslado confirmado o una devolución a OTRA bodega
// (ver materialTransferService.js#confirmTransfer / materialReturnService.js#createReturn) — copia
// purchaseOrderId/Item/ReceiptId/supplierId/unitCost del lote de ORIGEN (nunca se recalcula ni se
// promedia), así el costo real de la OC sobrevive sin importar cuántas veces el material cambie de
// bodega. Siempre crea una fila nueva (nunca incrementa un lote existente): cada
// traslado/devolución confirmado es su propio evento trazable, mismo criterio que una recepción de
// OC siempre crea su propio lote aunque ya exista otro del mismo material.
async function createLotFromTransfer({ sourceLot, warehouseId, quantity, date, userId, transaction, sourceType = 'traslado' }) {
  return MaterialLot.create({
    warehouseId,
    materialId: sourceLot.materialId,
    sourceType,
    originLotId: sourceLot.id,
    purchaseOrderId: sourceLot.purchaseOrderId,
    purchaseOrderItemId: sourceLot.purchaseOrderItemId,
    purchaseReceiptId: sourceLot.purchaseReceiptId,
    supplierId: sourceLot.supplierId,
    unit: sourceLot.unit,
    quantityReceived: quantity,
    quantityAvailable: quantity,
    unitCost: sourceLot.unitCost,
    receivedDate: date,
    createdBy: userId,
  }, { transaction });
}

// Repone quantityAvailable de un lote ya existente (rechazo de traslado/salida: el material vuelve
// íntegro al mismo lote del que salió) — SELECT...FOR UPDATE por el mismo motivo que consumeLotsPeps.
async function restoreLotQuantity(lotId, quantity, transaction) {
  const lot = await MaterialLot.findByPk(lotId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!lot) throw new ApiError(500, `Lote ${lotId} no encontrado al intentar reponer existencia`);
  lot.quantityAvailable = Number(lot.quantityAvailable) + Number(quantity);
  await lot.save({ transaction });
  return lot;
}

// Inverso de restoreLotQuantity: descuenta quantityAvailable de un lote ya existente — usado al
// rechazar una devolución ya registrada (ver materialReturnService.js#rejectReturn), para deshacer
// el crédito que esa devolución le había dado al lote. Bloquea si ese crédito ya se volvió a
// consumir por otro movimiento mientras tanto (no puede dejar el lote negativo).
async function decrementLotQuantity(lotId, quantity, transaction) {
  const lot = await MaterialLot.findByPk(lotId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!lot) throw new ApiError(500, `Lote ${lotId} no encontrado al intentar descontar existencia`);
  const next = Number(lot.quantityAvailable) - Number(quantity);
  if (next < 0) {
    throw new ApiError(400, 'No se puede rechazar esta devolución: parte de lo devuelto ya se volvió a consumir de ese lote.');
  }
  lot.quantityAvailable = next;
  await lot.save({ transaction });
  return lot;
}

module.exports = {
  findOrCreateMaterialByName, getDefaultWarehouse, assertWarehouseUsable,
  createLotFromReceipt, adjustLotForReceiptCorrection, consumeLotsPeps, restoreLotQuantity, createLotFromTransfer,
  decrementLotQuantity,
};
