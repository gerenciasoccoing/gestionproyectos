const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const {
  sequelize, InventoryItem, InventoryCheckout, InventoryCheckoutItem, InventoryCheckin, InventoryConfirmation,
  Project, Employee, ThirdParty, User,
} = require('../models');

// Cuántas horas queda vigente un enlace de confirmación antes de considerarse vencido (ver
// isExpired). Configurable porque distintos clientes pueden necesitar más o menos margen según
// cuánto tarde en llegarles el WhatsApp y responder.
const CONFIRMATION_HOURS = Number(process.env.INVENTORY_CONFIRMATION_HOURS || 48);

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
  { model: InventoryConfirmation, as: 'confirmations' },
];

// Token opaco de 192 bits, independiente de cualquier id interno (no expone ni permite inferir
// UUID de otras filas), para el enlace público de confirmación.
function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

async function createConfirmation({ kind, checkoutId, checkinIds }, transaction) {
  return InventoryConfirmation.create({
    token: generateToken(),
    kind,
    checkoutId,
    checkinIds: checkinIds || null,
    expiresAt: new Date(Date.now() + CONFIRMATION_HOURS * 3600 * 1000),
  }, { transaction });
}

function isExpired(confirmation) {
  return confirmation.status === 'pendiente' && new Date() > new Date(confirmation.expiresAt);
}

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

    // Un único enlace de confirmación de recepción para toda la salida (se genera siempre, se use
    // o no el envío por WhatsApp, para que el admin pueda copiarlo/reenviarlo manualmente si hace falta).
    await createConfirmation({ kind: 'salida', checkoutId: checkout.id }, t);

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

    // Un enlace de confirmación de devolución por cada lote de entrada (no por checkout completo:
    // una salida puede tener varias devoluciones parciales, cada una con su propio enlace).
    const confirmation = await createConfirmation(
      { kind: 'entrada', checkoutId, checkinIds: createdCheckins.map((c) => c.id) },
      t
    );

    return { checkout: await getCheckoutWithDetails(checkoutId, t), checkins: createdCheckins, confirmation };
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

// Carga un enlace de confirmación por su token, con lo necesario para armar el resumen público
// (buildPublicSummary). No valida vigencia acá: eso lo decide quien llama (get vs. confirm tratan
// el vencimiento distinto — get lo muestra, confirm lo rechaza).
async function getConfirmationByToken(token) {
  // hooks:false: endpoint público (sin sesión, ver inventoryConfirmationRoutes.js) — no hay
  // companyId de contexto todavía porque justamente esta consulta es la que lo resuelve, a
  // partir del token (192 bits aleatorios, imposible de adivinar). Es la única consulta de todo
  // este flujo, gracias al include, así que es el único punto que necesita este escape.
  const confirmation = await InventoryConfirmation.findOne({
    where: { token },
    include: [{ model: InventoryCheckout, as: 'checkout', include: CHECKOUT_DETAIL_INCLUDE }],
    hooks: false,
  });
  if (!confirmation) throw new ApiError(404, 'Enlace de confirmación no encontrado o inválido');
  return confirmation;
}

// Confirma un enlace (idempotente-seguro: si ya estaba confirmado o venció, rechaza en vez de
// reconfirmar). No registra "quién" más allá del responsable ya conocido del movimiento (el
// enlace se asume enviado solo a esa persona); solo queda el timestamp de confirmación.
async function confirmToken(token) {
  return sequelize.transaction(async (t) => {
    // hooks:false: mismo motivo que en getConfirmationByToken — endpoint público sin sesión.
    const confirmation = await InventoryConfirmation.findOne({ where: { token }, transaction: t, lock: t.LOCK.UPDATE, hooks: false });
    if (!confirmation) throw new ApiError(404, 'Enlace de confirmación no encontrado o inválido');
    if (confirmation.status === 'confirmado') throw new ApiError(409, 'Este movimiento ya fue confirmado anteriormente.');
    if (new Date() > new Date(confirmation.expiresAt)) throw new ApiError(410, 'Este enlace de confirmación venció. Contacta al administrador para gestionarlo manualmente.');
    confirmation.status = 'confirmado';
    confirmation.confirmedAt = new Date();
    await confirmation.save({ transaction: t });
    return confirmation;
  });
}

// Resumen mínimo para la página pública: solo lo del movimiento correspondiente a este enlace
// (nunca otros equipos, salidas o usuarios). Para 'entrada', filtra los checkins de este lote
// específico (checkinIds), no todos los que tenga la salida.
function buildPublicSummary(confirmation) {
  const checkout = confirmation.checkout;
  const destino = checkout.Project?.name || checkout.destinationText || '-';
  const responsable = checkout.responsibleEmployee?.name || checkout.responsibleThirdParty?.name || checkout.responsibleName || '-';

  const summary = {
    kind: confirmation.kind,
    status: confirmation.status,
    expired: isExpired(confirmation),
    confirmedAt: confirmation.confirmedAt,
    expiresAt: confirmation.expiresAt,
    destino,
    responsable,
  };

  if (confirmation.kind === 'salida') {
    summary.fecha = checkout.checkoutDate;
    summary.autorizadoPor = checkout.authorizedByUser?.name || '-';
    summary.items = checkout.items.map((it) => ({ name: it.InventoryItem.name, code: it.InventoryItem.code, quantity: Number(it.quantity) }));
  } else {
    const checkinIdSet = new Set(confirmation.checkinIds || []);
    const relevantCheckins = [];
    checkout.items.forEach((it) => {
      it.checkins.forEach((c) => {
        if (checkinIdSet.has(c.id)) relevantCheckins.push({ checkin: c, item: it.InventoryItem });
      });
    });
    summary.fecha = relevantCheckins[0]?.checkin.checkinDate || confirmation.createdAt;
    summary.items = relevantCheckins.map(({ checkin, item }) => ({
      name: item.name, code: item.code, quantity: Number(checkin.quantity), condition: checkin.condition, resultingStatus: checkin.resultingStatus,
    }));
  }

  return summary;
}

module.exports = {
  computeAvailableQuantity, assertItemAvailable, createCheckout, getCheckoutWithDetails,
  createCheckins, justifyMissing, getItemHistory, pendingQuantity, isExpired,
  getConfirmationByToken, confirmToken, buildPublicSummary,
};
