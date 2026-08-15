const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { InventoryCheckout, InventoryCheckoutItem, InventoryCheckin, InventoryConfirmation } = require('../models');
const {
  createCheckout, getCheckoutWithDetails, createCheckins, justifyMissing,
} = require('../services/inventoryService');
const { sendWhatsAppMessage, buildSalidaReportText, buildEntradaReportText } = require('../services/whatsappService');

// Base pública del frontend (sin barra final) para construir el enlace de confirmación que se
// envía por WhatsApp. Configurable porque el dominio real de producción no es el de desarrollo.
const FRONTEND_PUBLIC_URL = (process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');

function confirmUrlFor(confirmation) {
  return confirmation ? `${FRONTEND_PUBLIC_URL}/confirm/${confirmation.token}` : null;
}

const DETAIL_INCLUDE_SIMPLE = [
  { association: 'Project', attributes: ['id', 'name'] },
  { association: 'responsibleEmployee', attributes: ['id', 'name'] },
  { association: 'responsibleThirdParty', attributes: ['id', 'name'] },
  { association: 'authorizedByUser', attributes: ['id', 'name'] },
  { model: InventoryCheckoutItem, as: 'items' },
  { model: InventoryConfirmation, as: 'confirmations' },
];

const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) {
    if (!['activa', 'cerrada'].includes(status)) throw new ApiError(400, 'status debe ser activa o cerrada');
    where.status = status;
  }
  const checkouts = await InventoryCheckout.findAll({
    where,
    include: DETAIL_INCLUDE_SIMPLE,
    order: [['checkoutDate', 'DESC']],
  });
  res.json(checkouts);
});

const get = asyncHandler(async (req, res) => {
  const checkout = await getCheckoutWithDetails(req.params.id);
  res.json(checkout);
});

const create = asyncHandler(async (req, res) => {
  const {
    projectId, destinationText, responsibleEmployeeId, responsibleThirdPartyId, responsibleName,
    checkoutDate, notes, items,
  } = req.body;
  const checkout = await createCheckout({
    projectId: projectId || null,
    destinationText,
    responsibleEmployeeId: responsibleEmployeeId || null,
    responsibleThirdPartyId: responsibleThirdPartyId || null,
    responsibleName,
    authorizedByUserId: req.user.id,
    checkoutDate,
    notes,
    items,
    createdBy: req.user.id,
  });
  res.status(201).json(checkout);
});

// Devolución (total o parcial) de una o más líneas de la salida en un solo movimiento.
const checkin = asyncHandler(async (req, res) => {
  const { returns } = req.body;
  const result = await createCheckins(req.params.id, {
    returns,
    receivedByUserId: req.user.id,
    createdBy: req.user.id,
  });
  res.status(201).json(result);
});

// Marca una cantidad de una línea como perdida/no devuelta con justificación (sin devolución
// física), para poder cerrar la salida cuando algo nunca vuelve.
const justify = asyncHandler(async (req, res) => {
  const { quantity, note } = req.body;
  const checkout = await justifyMissing(req.params.id, req.params.itemId, { quantity, note, createdBy: req.user.id });
  res.json(checkout);
});

function resolveResponsable(checkout) {
  if (checkout.responsibleEmployee) return checkout.responsibleEmployee.name;
  if (checkout.responsibleThirdParty) return checkout.responsibleThirdParty.name;
  return checkout.responsibleName || '-';
}

function resolveDestino(checkout) {
  if (checkout.Project) return checkout.Project.name;
  return checkout.destinationText || '-';
}

// Envía por WhatsApp (LoroAPI) el reporte de la salida completa, tal como quedó registrada, con el
// enlace único de confirmación de recepción (creado junto con la salida).
const notifySalida = asyncHandler(async (req, res) => {
  const { numero } = req.body;
  const checkout = await getCheckoutWithDetails(req.params.id);
  const confirmation = (checkout.confirmations || []).find((c) => c.kind === 'salida');
  const texto = buildSalidaReportText({
    items: checkout.items.map((it) => ({ name: it.InventoryItem.name, code: it.InventoryItem.code, quantity: it.quantity })),
    destino: resolveDestino(checkout),
    responsable: resolveResponsable(checkout),
    autorizadoPor: checkout.authorizedByUser?.name || '-',
    fecha: checkout.checkoutDate,
    notes: checkout.notes,
    confirmUrl: confirmUrlFor(confirmation),
  });
  const result = await sendWhatsAppMessage(numero, texto);
  res.json({ ...result, preview: texto });
});

// Envía por WhatsApp (LoroAPI) el reporte de una devolución puntual: el lote de checkins de un
// enlace de confirmación de entrada específico (normalmente, el que se acaba de crear en la misma
// acción de "Entrada" — ver InventoryCheckoutsPage, que pasa el confirmationId recibido de checkin()).
const notifyEntrada = asyncHandler(async (req, res) => {
  const { numero, confirmationId } = req.body;
  if (!confirmationId) throw new ApiError(400, 'confirmationId es obligatorio');

  const checkout = await getCheckoutWithDetails(req.params.id);
  const confirmation = (checkout.confirmations || []).find((c) => c.id === confirmationId && c.kind === 'entrada');
  if (!confirmation) throw new ApiError(404, 'No se encontró el enlace de confirmación indicado en esta salida');

  const checkinIdSet = new Set(confirmation.checkinIds || []);
  const selected = [];
  checkout.items.forEach((it) => it.checkins.forEach((c) => {
    if (checkinIdSet.has(c.id)) selected.push({ checkin: c, item: it.InventoryItem });
  }));
  if (!selected.length) throw new ApiError(404, 'No se encontraron los checkins de este lote de devolución');

  const texto = buildEntradaReportText({
    items: selected.map(({ checkin: c, item }) => ({
      name: item.name, code: item.code, quantity: c.quantity, condition: c.condition, resultingStatus: c.resultingStatus,
    })),
    destino: resolveDestino(checkout),
    responsable: resolveResponsable(checkout),
    recibidoPor: selected[0].checkin.receivedByUser?.name || '-',
    fecha: selected[0].checkin.checkinDate,
    confirmUrl: confirmUrlFor(confirmation),
  });
  const result = await sendWhatsAppMessage(numero, texto);
  res.json({ ...result, preview: texto });
});

module.exports = { list, get, create, checkin, justify, notifySalida, notifyEntrada };
