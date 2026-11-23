const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { MaterialMovementSignature } = require('../models');
const materialTransferService = require('../services/materialTransferService');
const materialSignatureService = require('../services/materialSignatureService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateMaterialTransferActaPdf } = require('../services/pdfService');

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.warehouseId) {
    // Un traslado "toca" una bodega si es origen O destino — se filtra en JS sobre el resultado
    // completo (volumen bajo, no amerita un OR a nivel de SQL acá).
    const all = await materialTransferService.listTransfers({});
    return res.json(all.filter((tr) => tr.fromWarehouseId === req.query.warehouseId || tr.toWarehouseId === req.query.warehouseId));
  }
  const transfers = await materialTransferService.listTransfers(where);
  res.json(transfers);
});

const get = asyncHandler(async (req, res) => {
  const transfer = await materialTransferService.getTransfer(req.params.id);
  if (!transfer) throw new ApiError(404, 'Traslado no encontrado');
  res.json(transfer);
});

const create = asyncHandler(async (req, res) => {
  const { fromWarehouseId, toWarehouseId, date, lines, observations } = req.body;
  const transfer = await materialTransferService.createTransfer({
    fromWarehouseId, toWarehouseId, date, lines, observations, userId: req.user.id,
  });
  res.status(201).json(transfer);
});

// Confirmación DESDE LA PLATAFORMA (usuario autenticado): formulario completo con cantidad
// recibida por línea (puede ser menor a lo enviado) + firma dibujada — a diferencia del enlace
// público (ver publicMaterialSignatureController.js), que solo permite aceptar tal como se envió o
// rechazar, sin ajustar cantidades línea por línea (ver decisión documentada en
// materialSignatureService.js). Primero se mueve el stock (lo crítico); solo si eso tiene éxito se
// registra la firma — si la firma fallara después, el traslado ya quedó confirmado correctamente,
// solo faltaría la imagen de la firma (recuperable reintentando el registro de firma).
const confirm = asyncHandler(async (req, res) => {
  const { receivedByLine, shortageObservation, signatureDataUrl, signerName } = req.body;
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios');
  }
  const transfer = await materialTransferService.confirmTransfer({
    transferId: req.params.id, receivedByLine: receivedByLine || {}, shortageObservation, userId: req.user.id,
  });
  await materialSignatureService.signInApp({
    movementType: 'traslado', movementId: transfer.id, signatureDataUrl, signerName,
    userId: req.user.id, ip: req.ip, userAgent: req.headers['user-agent'],
  });
  res.json(transfer);
});

const reject = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const transfer = await materialTransferService.rejectTransfer({
    transferId: req.params.id, rejectionReason, userId: req.user.id,
  });
  await materialSignatureService.rejectInApp({
    movementType: 'traslado', movementId: transfer.id, rejectionReason, userId: req.user.id,
  });
  res.json(transfer);
});

// "Eliminar" un traslado YA CONFIRMADO es solo de Administrador, con observación obligatoria — ver
// materialTransferService.js#voidConfirmedTransfer (reversa en las DOS bodegas). La firma original
// de la confirmación se conserva intacta.
const voidSigned = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) throw new ApiError(403, 'Solo un Administrador puede anular un traslado ya confirmado.');
  const { observation } = req.body;
  const transfer = await materialTransferService.voidConfirmedTransfer({
    transferId: req.params.id, observation, userId: req.user.id,
  });
  res.json(transfer);
});

const requestSignature = asyncHandler(async (req, res) => {
  const result = await materialSignatureService.requestExternalSignature({
    movementType: 'traslado', movementId: req.params.id, email: req.body.email || null, phone: req.body.phone || null, userId: req.user.id,
  });
  res.json(result);
});

const getSignature = asyncHandler(async (req, res) => {
  const signature = await MaterialMovementSignature.findOne({ where: { movementType: 'traslado', movementId: req.params.id } });
  res.json(signature || null);
});

const exportPdf = asyncHandler(async (req, res) => {
  const transfer = await materialTransferService.getTransfer(req.params.id);
  if (!transfer) throw new ApiError(404, 'Traslado no encontrado');
  const signature = await MaterialMovementSignature.findOne({ where: { movementType: 'traslado', movementId: transfer.id } });
  const company = await getLetterheadForProject(null);
  const doc = generateMaterialTransferActaPdf({ transfer, company, signature });
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);
});

module.exports = { list, get, create, confirm, reject, voidSigned, requestSignature, getSignature, exportPdf };
