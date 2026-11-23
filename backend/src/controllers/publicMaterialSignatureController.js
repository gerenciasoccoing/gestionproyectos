// Controlador PÚBLICO (sin sesión, ver materialSignatureRoutes.js): quien confirma/rechaza un
// traslado/salida/devolución por este camino no tiene cuenta en la plataforma — el token largo y
// de un solo uso en la URL ES la autenticación, mismo criterio que voucherSignatureController.js/
// contractSignatureController.js.
//
// A diferencia del enlace de firma de comprobantes (que solo guarda una imagen), acá firmar/
// rechazar por el enlace público TAMBIÉN mueve stock real (confirma o rechaza el movimiento) — ver
// aplicarConfirmacion/aplicarRechazo. Esa parte de la lógica usa los modelos de la conexión
// restringida (con Row-Level Security activo), así que corre dentro de runWithCompany (ver
// tenantContext.js): abre una transacción real en esa conexión con el GUC de RLS seteado a partir
// de signature.companyId (ya conocido, sin ambigüedad — resuelto por el token, no por sesión), para
// que materialTransferService.js funcione exactamente igual que si lo llamara un usuario autenticado.
//
// Para simplificar el formulario sin login (pensado para celular, sin la pantalla completa de
// cantidad-por-línea que sí tiene la confirmación dentro de la app), el enlace público solo permite
// aceptar el movimiento TAL COMO se envió o rechazarlo con motivo — ajustar cantidades línea por
// línea (faltantes parciales) se hace desde la plataforma (ver materialTransferController.js#confirm).
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { runWithCompany } = require('../utils/tenantContext');
const materialSignatureService = require('../services/materialSignatureService');
const materialTransferService = require('../services/materialTransferService');
const materialIssueService = require('../services/materialIssueService');
const materialReturnService = require('../services/materialReturnService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateMaterialTransferActaPdf, generateMaterialIssuePdf, generateMaterialReturnPdf } = require('../services/pdfService');

async function aplicarConfirmacion(signature) {
  switch (signature.movementType) {
    case 'traslado':
      return materialTransferService.confirmTransfer({ transferId: signature.movementId, receivedByLine: {}, userId: null });
    case 'salida':
      return materialIssueService.markSigned(signature.movementId);
    case 'devolucion':
      return materialReturnService.markSigned(signature.movementId);
    default:
      throw new ApiError(400, 'Tipo de movimiento no soportado todavía');
  }
}

async function aplicarRechazo(signature, rejectionReason) {
  switch (signature.movementType) {
    case 'traslado':
      return materialTransferService.rejectTransfer({ transferId: signature.movementId, rejectionReason, userId: null });
    case 'salida':
      return materialIssueService.rejectIssue({ issueId: signature.movementId, rejectionReason, userId: null });
    case 'devolucion':
      return materialReturnService.rejectReturn({ returnId: signature.movementId, rejectionReason, userId: null });
    default:
      throw new ApiError(400, 'Tipo de movimiento no soportado todavía');
  }
}

async function loadDocumentPdf(signature) {
  switch (signature.movementType) {
    case 'traslado': {
      const transfer = await materialTransferService.getTransfer(signature.movementId);
      const company = await getLetterheadForProject(null);
      return generateMaterialTransferActaPdf({ transfer, company, signature });
    }
    case 'salida': {
      const issue = await materialIssueService.getIssue(signature.movementId);
      const company = await getLetterheadForProject(issue.projectId);
      return generateMaterialIssuePdf({ issue, company, signature });
    }
    case 'devolucion': {
      const materialReturn = await materialReturnService.getReturn(signature.movementId);
      const company = await getLetterheadForProject(materialReturn.projectId);
      return generateMaterialReturnPdf({ materialReturn, company, signature });
    }
    default:
      throw new ApiError(400, 'Tipo de movimiento no soportado todavía');
  }
}

const get = asyncHandler(async (req, res) => {
  const { signature, status } = await materialSignatureService.getSignableSlot(req.params.token);
  res.json({
    status,
    movementType: signature.movementType,
    signedAt: signature.signedAt,
    rejectedAt: signature.rejectedAt,
  });
});

const getDocument = asyncHandler(async (req, res) => {
  const { signature } = await materialSignatureService.getSignableSlot(req.params.token);
  const doc = await runWithCompany(signature.companyId, () => loadDocumentPdf(signature));
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);
});

const sign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, signerName } = req.body;
  const { signature, status } = await materialSignatureService.getSignableSlot(req.params.token);
  if (status !== 'pendiente') throw new ApiError(400, 'Este movimiento ya fue resuelto.');
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios.');
  }

  // Primero el movimiento de stock (lo crítico, con su propia transacción vía runWithCompany); solo
  // si tiene éxito se registra la firma — así nunca queda "firmado" sin que el stock se haya movido.
  await runWithCompany(signature.companyId, () => aplicarConfirmacion(signature));
  const updated = await materialSignatureService.signExternal({
    rawToken: req.params.token, signatureDataUrl, signerName, ip: req.ip, userAgent: req.headers['user-agent'],
  });
  res.json({ status: 'firmado', signedAt: updated.signedAt });
});

const reject = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  const { signature, status } = await materialSignatureService.getSignableSlot(req.params.token);
  if (status !== 'pendiente') throw new ApiError(400, 'Este movimiento ya fue resuelto.');
  if (!rejectionReason || !rejectionReason.trim()) throw new ApiError(400, 'rejectionReason es obligatorio.');

  await runWithCompany(signature.companyId, () => aplicarRechazo(signature, rejectionReason));
  const updated = await materialSignatureService.rejectExternal({
    rawToken: req.params.token, rejectionReason, ip: req.ip, userAgent: req.headers['user-agent'],
  });
  res.json({ status: 'rechazado', rejectedAt: updated.rejectedAt });
});

module.exports = { get, getDocument, sign, reject };
