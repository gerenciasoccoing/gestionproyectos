const ApiError = require('../utils/ApiError');
const {
  sequelize, InventoryItem, InventoryCheckout, InventoryCheckoutItem, InventoryCheckin,
  Project, Employee, ThirdParty, User,
} = require('../models');

const CHECKOUT_ITEM_INCLUDE = { model: InventoryItem };
const CHECKOUT_DETAIL_INCLUDE = [
  { model: Project },
  { model: Employee, as: 'responsibleEmployee' },
  { model: ThirdParty, as: 'responsibleThirdParty' },
  { model: User, as: 'authorizedByUser', attributes: ['id', 'name', 'email'] },
  {
    model: InventoryCheckoutItem,
    as: 'items',
    include: [
      CHECKOUT_ITEM_INCLUDE,
      { model: InventoryCheckin, as: 'checkins', include: [{ model: User, as: 'receivedByUser', attributes: ['id', 'name', 'email'] }] },
    ],
  },
];

// Cuánto de un ítem "cantidad" está disponible ahora mismo: lo que hay en stock, menos lo dado de
// baja/en mantenimiento, menos lo reservado en líneas de salidas todavía activas (sin devolver ni
// justificar). Para ítems "serializado" no se usa: su disponibilidad es directamente su `status`.
async function computeAvailableQuantity(item, transaction) {
  const lines = await InventoryCheckoutItem.findAll({
    where: { inventoryItemId: item.id },
    include: [{ model: InventoryCheckout, as: 'checkout', where: { status: 'activa' }, attributes: [] }],
    transaction,
  });
  const reserved = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) - Number(l.returnedQuantity) - Number(l.justifiedMissingQuantity)),
    0
  );
  return Number(item.stockQuantity || 0) - Number(item.maintenanceQuantity || 0) - Number(item.retiredQuantity || 0) - reserved;
}

// Valida que se pueda dar salida a `requestedQty` unidades de `item`; lanza ApiError si no.
async function assertItemAvailable(item, requestedQty, transaction) {
  if (item.status === 'baja') {
    throw new ApiError(409, `El equipo "${item.name}" está dado de baja y no puede salir.`);
  }
  if (item.trackingType === 'serializado') {
    if (item.status !== 'disponible') {
      throw new ApiError(409, `El equipo "${item.name}" no está disponible (estado actual: ${item.status}). No puede tener dos salidas activas a la vez.`);
    }
    return;
  }
  const available = await computeAvailableQuantity(item, transaction);
  if (Number(requestedQty) > available) {
    throw new ApiError(409, `Solo hay ${available} unidad(es) disponibles de "${item.name}" (solicitadas: ${requestedQty}).`);
  }
}

// Registra una salida con una o más líneas de equipo. Cada equipo serializado pasa a
// 'en_prestamo'; los de tipo "cantidad" solo quedan reservados (su status no cambia).
async function createCheckout({ projectId, destinationText, responsibleEmployeeId, responsibleThirdPartyId, responsibleName, authorizedByUserId, checkoutDate, notes, items, createdBy }) {
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'Debe incluir al menos un equipo en la salida');
  if (!destinationText && !projectId) throw new ApiError(400, 'Debe indicar un destino (proyecto o texto libre)');
  if (!responsibleEmployeeId && !responsibleThirdPartyId && !responsibleName) {
    throw new ApiError(400, 'Debe indicar la persona responsable (empleado, tercero o nombre)');
  }

  return sequelize.transaction(async (t) => {
    const inventoryItemIds = items.map((it) => it.inventoryItemId);
    const dbItems = await InventoryItem.findAll({ where: { id: inventoryItemIds }, transaction: t, lock: t.LOCK.UPDATE });
    const dbItemsById = new Map(dbItems.map((it) => [it.id, it]));

    for (const line of items) {
      const dbItem = dbItemsById.get(line.inventoryItemId);
      if (!dbItem) throw new ApiError(404, `Equipo ${line.inventoryItemId} no encontrado`);
      const quantity = dbItem.trackingType === 'serializado' ? 1 : Number(line.quantity || 1);
      if (quantity <= 0) throw new ApiError(400, `Cantidad inválida para "${dbItem.name}"`);
      await assertItemAvailable(dbItem, quantity, t);
    }

    const checkout = await InventoryCheckout.create({
      projectId: projectId || null,
      destinationText: destinationText || null,
      responsibleEmployeeId: responsibleEmployeeId || null,
      responsibleThirdPartyId: responsibleThirdPartyId || null,
      responsibleName: responsibleName || null,
      authorizedByUserId: authorizedByUserId || null,
      checkoutDate: checkoutDate || new Date(),
      notes: notes || null,
      createdBy: createdBy || null,
    }, { transaction: t });

    for (const line of items) {
      const dbItem = dbItemsById.get(line.inventoryItemId);
      const quantity = dbItem.trackingType === 'serializado' ? 1 : Number(line.quantity || 1);
      // eslint-disable-next-line no-await-in-loop
      await InventoryCheckoutItem.create({ checkoutId: checkout.id, inventoryItemId: dbItem.id, quantity }, { transaction: t });
      if (dbItem.trackingType === 'serializado') {
        dbItem.status = 'en_prestamo';
        // eslint-disable-next-line no-await-in-loop
        await dbItem.save({ transaction: t });
      }
    }

    return getCheckoutWithDetails(checkout.id, t);
  });
}

async function getCheckoutWithDetails(id, transaction) {
  const checkout = await InventoryCheckout.findByPk(id, { include: CHECKOUT_DETAIL_INCLUDE, transaction });
  if (!checkout) throw new ApiError(404, 'Salida de inventario no encontrada');
  return checkout;
}

function pendingQuantity(checkoutItem) {
  return Number(checkoutItem.quantity) - Number(checkoutItem.returnedQuantity) - Number(checkoutItem.justifiedMissingQuantity);
}

// Cierra la salida si TODAS sus líneas quedaron resueltas (devueltas y/o justificadas).
async function maybeCloseCheckout(checkoutId, transaction) {
  const checkout = await InventoryCheckout.findByPk(checkoutId, {
    include: [{ model: InventoryCheckoutItem, as: 'items' }],
    transaction,
  });
  if (!checkout || checkout.status === 'cerrada') return;
  const allResolved = checkout.items.every((it) => pendingQuantity(it) <= 0.0001);
  if (allResolved) {
    checkout.status = 'cerrada';
    await checkout.save({ transaction });
  }
}

// Registra uno o más eventos de devolución en una sola operación (una "entrada" puede cubrir
// varios equipos/líneas de la misma salida a la vez, igual que una salida cubre varios al salir).
// returns: [{ checkoutItemId, quantity, condition, resultingStatus, notes }]
async function createCheckins(checkoutId, { returns, receivedByUserId, createdBy }) {
  if (!Array.isArray(returns) || !returns.length) throw new ApiError(400, 'Debe indicar al menos un equipo a devolver');

  return sequelize.transaction(async (t) => {
    const checkout = await InventoryCheckout.findByPk(checkoutId, { transaction: t });
    if (!checkout) throw new ApiError(404, 'Salida de inventario no encontrada');
    if (checkout.status === 'cerrada') throw new ApiError(400, 'Esta salida ya está cerrada');

    const createdCheckins = [];
    for (const ret of returns) {
      const { checkoutItemId, quantity, condition, resultingStatus, notes } = ret;
      if (!checkoutItemId || quantity === undefined || !condition || !resultingStatus) {
        throw new ApiError(400, 'checkoutItemId, quantity, condition y resultingStatus son obligatorios en cada devolución');
      }
      if (!['bueno', 'dañado', 'incompleto'].includes(condition)) throw new ApiError(400, `condition inválida: ${condition}`);
      if (!['disponible', 'mantenimiento', 'baja'].includes(resultingStatus)) throw new ApiError(400, `resultingStatus inválido: ${resultingStatus}`);
      if (Number(quantity) <= 0) throw new ApiError(400, 'La cantidad a devolver debe ser mayor a 0');

      // eslint-disable-next-line no-await-in-loop
      const checkoutItem = await InventoryCheckoutItem.findOne({
        where: { id: checkoutItemId, checkoutId },
        include: [{ model: InventoryItem, required: true }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!checkoutItem) throw new ApiError(404, `Línea de salida ${checkoutItemId} no encontrada en esta salida`);

      const pending = pendingQuantity(checkoutItem);
      if (Number(quantity) > pending + 0.0001) {
        throw new ApiError(400, `Cantidad a devolver (${quantity}) supera lo pendiente (${pending}) de "${checkoutItem.InventoryItem.name}"`);
      }

      // eslint-disable-next-line no-await-in-loop
      const checkin = await InventoryCheckin.create({
        checkoutItemId,
        quantity,
        condition,
        resultingStatus,
        receivedByUserId: receivedByUserId || null,
        checkinDate: new Date(),
        notes: notes || null,
        createdBy: createdBy || null,
      }, { transaction: t });
      createdCheckins.push(checkin);

      checkoutItem.returnedQuantity = Number(checkoutItem.returnedQuantity) + Number(quantity);
      // eslint-disable-next-line no-await-in-loop
      await checkoutItem.save({ transaction: t });

      const item = checkoutItem.InventoryItem;
      if (item.trackingType === 'serializado') {
        item.status = resultingStatus;
      } else if (resultingStatus === 'baja') {
        item.retiredQuantity = Number(item.retiredQuantity) + Number(quantity);
      } else if (resultingStatus === 'mantenimiento') {
        item.maintenanceQuantity = Number(item.maintenanceQuantity) + Number(quantity);
      }
      // eslint-disable-next-line no-await-in-loop
      await item.save({ transaction: t });
    }

    await maybeCloseCheckout(checkoutId, t);
    return { checkout: await getCheckoutWithDetails(checkoutId, t), checkins: createdCheckins };
  });
}

// Da por perdida/no devuelta una cantidad de una línea, sin devolución física (ej. equipo
// extraviado): permite cerrar la salida sin esperar a que todo vuelva. Para serializado, el
// equipo queda 'baja' (nunca volvió); para cantidad, se suma a retiredQuantity.
async function justifyMissing(checkoutId, checkoutItemId, { quantity, note, createdBy }) {
  if (quantity === undefined || Number(quantity) <= 0) throw new ApiError(400, 'quantity debe ser mayor a 0');
  if (!note || !note.trim()) throw new ApiError(400, 'Debe indicar el motivo de la justificación');

  return sequelize.transaction(async (t) => {
    const checkout = await InventoryCheckout.findByPk(checkoutId, { transaction: t });
    if (!checkout) throw new ApiError(404, 'Salida de inventario no encontrada');
    if (checkout.status === 'cerrada') throw new ApiError(400, 'Esta salida ya está cerrada');

    const checkoutItem = await InventoryCheckoutItem.findOne({
      where: { id: checkoutItemId, checkoutId },
      include: [{ model: InventoryItem, required: true }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!checkoutItem) throw new ApiError(404, 'Línea de salida no encontrada en esta salida');

    const pending = pendingQuantity(checkoutItem);
    if (Number(quantity) > pending + 0.0001) {
      throw new ApiError(400, `Cantidad a justificar (${quantity}) supera lo pendiente (${pending})`);
    }

    checkoutItem.justifiedMissingQuantity = Number(checkoutItem.justifiedMissingQuantity) + Number(quantity);
    checkoutItem.justificationNote = checkoutItem.justificationNote
      ? `${checkoutItem.justificationNote}\n${note}`
      : note;
    await checkoutItem.save({ transaction: t });

    const item = checkoutItem.InventoryItem;
    if (item.trackingType === 'serializado') {
      item.status = 'baja';
    } else {
      item.retiredQuantity = Number(item.retiredQuantity) + Number(quantity);
    }
    await item.save({ transaction: t });

    await maybeCloseCheckout(checkoutId, t);
    return getCheckoutWithDetails(checkoutId, t);
  });
}

// Historial completo de movimientos de un equipo: cada línea de salida en la que aparece, con
// sus devoluciones, para saber quién lo ha usado y cuándo.
async function getItemHistory(inventoryItemId) {
  const item = await InventoryItem.findByPk(inventoryItemId);
  if (!item) throw new ApiError(404, 'Equipo no encontrado');
  const lines = await InventoryCheckoutItem.findAll({
    where: { inventoryItemId },
    include: [
      {
        model: InventoryCheckout,
        as: 'checkout',
        include: [
          { model: Project },
          { model: Employee, as: 'responsibleEmployee' },
          { model: ThirdParty, as: 'responsibleThirdParty' },
        ],
      },
      { model: InventoryCheckin, as: 'checkins', include: [{ model: User, as: 'receivedByUser', attributes: ['id', 'name', 'email'] }] },
    ],
    order: [[{ model: InventoryCheckout, as: 'checkout' }, 'checkoutDate', 'DESC']],
  });
  return { item, lines };
}

module.exports = {
  computeAvailableQuantity, assertItemAvailable, createCheckout, getCheckoutWithDetails,
  createCheckins, justifyMissing, getItemHistory, pendingQuantity,
};
