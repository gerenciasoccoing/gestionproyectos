const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { MaterialMovementSignature } = require('../models');
const materialIssueService = require('../services/materialIssueService');
const materialSignatureService = require('../services/materialSignatureService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateMaterialIssuePdf } = require('../services/pdfService');

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.projectId) where.projectId = req.query.projectId;
  if (req.query.warehouseId) where.fromWarehouseId = req.query.warehouseId;
  const issues = await materialIssueService.listIssues(where);
  res.json(issues);
});

const get = asyncHandler(async (req, res) => {
  const issue = await materialIssueService.getIssue(req.params.id);
  if (!issue) throw new ApiError(404, 'Salida no encontrada');
  res.json(issue);
});

const create = asyncHandler(async (req, res) => {
  const issue = await materialIssueService.createIssue({ ...req.body, userId: req.user.id });
  res.status(201).json(issue);
});

// Firma DESDE LA PLATAFORMA (usuario autenticado, p. ej. el receptor firma en el dispositivo de
// quien entrega) — el stock ya se descontó al crear la salida, firmar solo certifica la entrega
// (ver materialIssueService.js#markSigned).
const sign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, signerName } = req.body;
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios');
  }
  await materialSignatureService.signInApp({
    movementType: 'salida', movementId: req.params.id, signatureDataUrl, signerName,
    userId: req.user.id, ip: req.ip, userAgent: req.headers['user-agent'],
  });
  const issue = await materialIssueService.markSigned(req.params.id);
  res.json(issue);
});

const reject = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const issue = await materialIssueService.rejectIssue({ issueId: req.params.id, rejectionReason, userId: req.user.id });
  await materialSignatureService.rejectInApp({ movementType: 'salida', movementId: issue.id, rejectionReason, userId: req.user.id });
  res.json(issue);
});

// "Eliminar" una salida YA FIRMADA es solo de Administrador, con observación obligatoria (ver
// MaterialMovementAudit.js) — la firma original NO se toca (sigue mostrando quién firmó, cuándo y
// con qué evidencia: es historia, no se borra), solo el ESTADO de la salida pasa a 'rechazado' y
// el stock se reversa, dejando además el registro de auditoría.
const voidSigned = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) throw new ApiError(403, 'Solo un Administrador puede anular una salida ya firmada.');
  const { observation } = req.body;
  const issue = await materialIssueService.rejectIssue({
    issueId: req.params.id, rejectionReason: observation, userId: req.user.id, isAdminVoid: true,
  });
  res.json(issue);
});

// Reenvío de link: igual acción que la primera solicitud — un nuevo token invalida el anterior
// (ver materialSignatureService.js#requestExternalSignature), permitido mientras siga 'pendiente_firma'.
const requestSignature = asyncHandler(async (req, res) => {
  const result = await materialSignatureService.requestExternalSignature({
    movementType: 'salida', movementId: req.params.id, email: req.body.email || null, phone: req.body.phone || null, userId: req.user.id,
  });
  res.json(result);
});

const getSignature = asyncHandler(async (req, res) => {
  const signature = await MaterialMovementSignature.findOne({ where: { movementType: 'salida', movementId: req.params.id } });
  res.json(signature || null);
});

const exportPdf = asyncHandler(async (req, res) => {
  const issue = await materialIssueService.getIssue(req.params.id);
  if (!issue) throw new ApiError(404, 'Salida no encontrada');
  const signature = await MaterialMovementSignature.findOne({ where: { movementType: 'salida', movementId: issue.id } });
  const company = await getLetterheadForProject(issue.projectId);
  const doc = generateMaterialIssuePdf({ issue, company, signature });
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);
});

module.exports = { list, get, create, sign, reject, voidSigned, requestSignature, getSignature, exportPdf };
