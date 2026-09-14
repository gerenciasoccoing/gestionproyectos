// Controlador PÚBLICO (sin sesión, ver contractSignatureRoutes.js): la persona que firma un
// contrato/otrosí no tiene cuenta en la plataforma — el token largo y de un solo uso que llega en
// la URL ES la autenticación acá, mismo criterio que companyRegistrationController.js/
// inventoryConfirmationController.js.
const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
// Ruta pública sin sesión: mismo motivo que en contractSignatureService.js (Employee/Project acá
// tampoco pueden resolverse por la conexión normal, RLS-restringida, sin un contexto de empresa
// que esta petición nunca tiene).
const { Employee, Project } = require('../models/adminModels');
const { getSignableDocument, signDocument } = require('../services/contractSignatureService');
const { CONTRACT_TYPE_LABELS } = require('../services/contractTemplates');
const { UPLOAD_ROOT } = require('../middleware/upload');

const get = asyncHandler(async (req, res) => {
  const { doc, status } = await getSignableDocument(req.params.token);
  const employee = await Employee.findByPk(doc.employeeId, { hooks: false });
  const project = employee ? await Project.findByPk(employee.projectId, { hooks: false }) : null;
  res.json({
    status,
    employeeName: employee?.name || null,
    projectName: project?.name || null,
    documentLabel: doc.kind === 'otrosi' ? `Otrosí No. ${doc.sequenceNumber}` : (CONTRACT_TYPE_LABELS[doc.contractType] || 'Contrato'),
    signedAt: doc.signedAt,
  });
});

// Sirve el PDF sin firmar (para revisar antes de firmar) o el ya firmado (si status='firmado') —
// nunca uno de los otros archivos del trabajador, solo el de ESTE documento y solo por su token.
const getDocument = asyncHandler(async (req, res) => {
  const { doc, status } = await getSignableDocument(req.params.token);
  const filePath = status === 'firmado' && doc.signedPdfFilePath ? doc.signedPdfFilePath : doc.pdfFilePath;
  if (!filePath) throw new ApiError(404, 'Documento no disponible.');
  const abs = path.join(UPLOAD_ROOT, filePath);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'Documento no disponible.');
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(abs);
});

const sign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, signerName } = req.body;
  const doc = await signDocument({
    rawToken: req.params.token,
    signatureDataUrl,
    signerName,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ status: 'firmado', signedAt: doc.signedAt });
});

module.exports = { get, getDocument, sign };
