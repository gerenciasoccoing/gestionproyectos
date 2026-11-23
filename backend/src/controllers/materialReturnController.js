const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { MaterialMovementSignature } = require('../models');
const materialReturnService = require('../services/materialReturnService');
const materialSignatureService = require('../services/materialSignatureService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateMaterialReturnPdf } = require('../services/pdfService');

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.projectId) where.projectId = req.query.projectId;
  const returns = await materialReturnService.listReturns(where);
  res.json(returns);
});

const get = asyncHandler(async (req, res) => {
  const materialReturn = await materialReturnService.getReturn(req.params.id);
  if (!materialReturn) throw new ApiError(404, 'Devolución no encontrada');
  res.json(materialReturn);
});

// Cuánto se puede devolver todavía, por material, de una salida — usado por el formulario para
// sugerir el tope sin que el usuario tenga que calcularlo a mano.
const getReturnable = asyncHandler(async (req, res) => {
  const result = await materialReturnService.getReturnableForIssue(req.params.issueId);
  res.json(result);
});

const create = asyncHandler(async (req, res) => {
  const materialReturn = await materialReturnService.createReturn({ ...req.body, userId: req.user.id });
  res.status(201).json(materialReturn);
});

const sign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, signerName } = req.body;
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios');
  }
  await materialSignatureService.signInApp({
    movementType: 'devolucion', movementId: req.params.id, signatureDataUrl, signerName,
    userId: req.user.id, ip: req.ip, userAgent: req.headers['user-agent'],
  });
  const materialReturn = await materialReturnService.markSigned(req.params.id);
  res.json(materialReturn);
});

const reject = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const materialReturn = await materialReturnService.rejectReturn({ returnId: req.params.id, rejectionReason, userId: req.user.id });
  await materialSignatureService.rejectInApp({ movementType: 'devolucion', movementId: materialReturn.id, rejectionReason, userId: req.user.id });
  res.json(materialReturn);
});

// "Eliminar" una devolución YA FIRMADA es solo de Administrador, con observación obligatoria — la
// firma original se conserva intacta, solo cambia el estado y se reversa el crédito de stock.
const voidSigned = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) throw new ApiError(403, 'Solo un Administrador puede anular una devolución ya firmada.');
  const { observation } = req.body;
  const materialReturn = await materialReturnService.rejectReturn({
    returnId: req.params.id, rejectionReason: observation, userId: req.user.id, isAdminVoid: true,
  });
  res.json(materialReturn);
});

const requestSignature = asyncHandler(async (req, res) => {
  const result = await materialSignatureService.requestExternalSignature({
    movementType: 'devolucion', movementId: req.params.id, email: req.body.email || null, phone: req.body.phone || null, userId: req.user.id,
  });
  res.json(result);
});

const getSignature = asyncHandler(async (req, res) => {
  const signature = await MaterialMovementSignature.findOne({ where: { movementType: 'devolucion', movementId: req.params.id } });
  res.json(signature || null);
});

const exportPdf = asyncHandler(async (req, res) => {
  const materialReturn = await materialReturnService.getReturn(req.params.id);
  if (!materialReturn) throw new ApiError(404, 'Devolución no encontrada');
  const signature = await MaterialMovementSignature.findOne({ where: { movementType: 'devolucion', movementId: materialReturn.id } });
  const company = await getLetterheadForProject(materialReturn.projectId);
  const doc = generateMaterialReturnPdf({ materialReturn, company, signature });
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);
});

module.exports = { list, get, getReturnable, create, sign, reject, voidSigned, requestSignature, getSignature, exportPdf };
