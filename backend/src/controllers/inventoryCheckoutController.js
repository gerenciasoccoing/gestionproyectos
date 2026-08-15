const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { InventoryCheckout, InventoryCheckoutItem, InventoryCheckin } = require('../models');
const {
  createCheckout, getCheckoutWithDetails, createCheckins, justifyMissing,
} = require('../services/inventoryService');
const { sendWhatsAppMessage, buildSalidaReportText, buildEntradaReportText } = require('../services/whatsappService');

const DETAIL_INCLUDE_SIMPLE = [
  { association: 'Project', attributes: ['id', 'name'] },
  { association: 'responsibleEmployee', attributes: ['id', 'name'] },
  { association: 'responsibleThirdParty', attributes: ['id', 'name'] },
  { association: 'authorizedByUser', attributes: ['id', 'name'] },
  { model: InventoryCheckoutItem, as: 'items' },
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

// Envía por WhatsApp (LoroAPI) el reporte de la salida completa, tal como quedó registrada.
const notifySalida = asyncHandler(async (req, res) => {
  const { numero } = req.body;
  const checkout = await getCheckoutWithDetails(req.params.id);
  const texto = buildSalidaReportText({
    items: checkout.items.map((it) => ({ name: it.InventoryItem.name, code: it.InventoryItem.code, quantity: it.quantity })),
    destino: resolveDestino(checkout),
    responsable: resolveResponsable(checkout),
    autorizadoPor: checkout.authorizedByUser?.name || '-',
    fecha: checkout.checkoutDate,
    notes: checkout.notes,
  });
  const result = await sendWhatsAppMessage(numero, texto);
  res.json({ ...result, preview: texto });
});

// Envía por WhatsApp (LoroAPI) el reporte de una devolución puntual: solo las líneas de checkin
// indicadas (normalmente, las que se acaban de registrar en la misma acción de "Entrada").
const notifyEntrada = asyncHandler(async (req, res) => {
  const { numero, checkinIds } = req.body;
  if (!Array.isArray(checkinIds) || !checkinIds.length) throw new ApiError(400, 'checkinIds es obligatorio');

  const checkout = await getCheckoutWithDetails(req.params.id);
  const checkinById = new Map();
  checkout.items.forEach((it) => it.checkins.forEach((c) => checkinById.set(c.id, { checkin: c, item: it.InventoryItem })));

  const selected = checkinIds.map((id) => checkinById.get(id)).filter(Boolean);
  if (!selected.length) throw new ApiError(404, 'No se encontraron los checkins indicados en esta salida');

  const texto = buildEntradaReportText({
    items: selected.map(({ checkin: c, item }) => ({
      name: item.name, code: item.code, quantity: c.quantity, condition: c.condition, resultingStatus: c.resultingStatus,
    })),
    destino: resolveDestino(checkout),
    responsable: resolveResponsable(checkout),
    recibidoPor: selected[0].checkin.receivedByUser?.name || '-',
    fecha: selected[0].checkin.checkinDate,
  });
  const result = await sendWhatsAppMessage(numero, texto);
  res.json({ ...result, preview: texto });
});

module.exports = { list, get, create, checkin, justify, notifySalida, notifyEntrada };
