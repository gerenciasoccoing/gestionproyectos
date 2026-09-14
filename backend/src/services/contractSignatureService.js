const crypto = require('crypto');
const path = require('path');
const { UPLOAD_ROOT } = require('../middleware/upload');
// requestSignature se llama siempre autenticado (desde la ficha del trabajador, con la empresa ya
// resuelta por el JWT) — usa la conexión normal, con RLS activo, igual que el resto de la app.
const { EmployeeContractDocument, Employee, Project } = require('../models');
// getSignableDocument/signDocument, en cambio, los llama un desconocido sin sesión que llega con
// un token en la URL (ver contractSignatureController.js) — todavía no hay ninguna empresa de
// contexto para el RLS de Capa 2 (nadie llamó a authenticate/runInTransactionContext), así que con
// la conexión normal esas consultas devolverían 0 filas siempre, no un error. Se resuelven con la
// conexión de administración (exenta de RLS), exactamente el mismo caso ya resuelto así en
// authController.js (login/forgotPassword) y companyRegistrationController.js: "encontrar algo por
// un identificador público, sin saber todavía a qué empresa pertenece".
const adminModels = require('../models/adminModels');
const ApiError = require('../utils/ApiError');
const { generateContractPdf } = require('./pdfService');
const { buildContractContent, formatDateEs } = require('./contractTemplates');
const { saveGeneratedFile } = require('../middleware/upload');
const { sendContractSignatureEmail } = require('./emailService');

const SIGNATURE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días — más largo que el de "olvidé mi
// contraseña" (1h) a propósito: firmar un contrato no es algo que la persona haga en el momento
// que le llega el correo, necesita margen real.

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function frontendUrl(urlPath) {
  const base = (process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${urlPath}`;
}

// Mismo criterio/forma de letterheadService.js#getLetterheadForProject (consorcio del proyecto si
// tiene uno, si no la empresa principal), pero resuelto con la conexión de administración: la
// versión normal depende de getCurrentCompanyId() (AsyncLocalStorage, ver tenantContext.js), que
// en esta petición pública no existe — usarla tal cual haría que companySettingsController
// #getCompany lance 404 en cada firma. doc.companyId (ya sabemos a qué empresa pertenece el
// documento, sin ambigüedad) reemplaza esa resolución por contexto.
async function resolveLetterheadForSigning(doc, project) {
  if (project?.consortiumId) {
    const consortium = await adminModels.Consortium.findByPk(project.consortiumId, { hooks: false });
    if (consortium) {
      return {
        companyName: consortium.name, nit: consortium.nit, address: consortium.address,
        phone: consortium.phone, managerName: consortium.legalRepName,
        logoPath: consortium.logoPath ? path.join(UPLOAD_ROOT, consortium.logoPath) : null,
      };
    }
  }
  const company = await adminModels.Company.findByPk(doc.companyId, { hooks: false });
  if (!company) return null;
  return {
    companyName: company.companyName, nit: company.nit, address: company.address,
    phone: company.phone, managerName: company.managerName,
    logoPath: company.logoPath ? path.join(UPLOAD_ROOT, company.logoPath) : null,
  };
}

function pdfDocToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Genera (o regenera) el link de firma de un documento YA emitido (doc.pdfFilePath tiene que
// existir — este flujo nunca genera el contrato, solo lo expone por un link público) y, si el
// trabajador tiene correo registrado, se lo envía. Devuelve siempre signUrl (aunque el correo
// falle) para que quien lo pidió pueda copiarlo y mandarlo a mano — mismo respaldo que se usó a
// mano para el flujo de "olvidé mi contraseña" cuando el correo no llega (ver forgotPassword).
async function requestSignature({ employeeId, contractId, projectId }) {
  const doc = await EmployeeContractDocument.findOne({ where: { id: contractId, employeeId } });
  if (!doc) throw new ApiError(404, 'Documento no encontrado para este trabajador.');
  if (!doc.pdfFilePath) throw new ApiError(400, 'Este documento todavía no tiene un PDF generado.');
  if (doc.signatureStatus === 'firmado') throw new ApiError(400, 'Este documento ya fue firmado.');

  const employee = await Employee.findByPk(employeeId);
  if (!employee?.email) {
    throw new ApiError(400, 'Este trabajador no tiene un correo registrado. Agrégalo en su ficha antes de enviarlo a firmar.');
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  doc.signatureTokenHash = hashToken(rawToken);
  doc.signatureTokenExpiresAt = new Date(Date.now() + SIGNATURE_TOKEN_TTL_MS);
  doc.signatureStatus = 'pendiente';
  await doc.save();

  const project = await Project.findByPk(projectId);
  const signUrl = frontendUrl(`/sign-contract/${rawToken}`);
  const documentLabel = doc.kind === 'otrosi' ? `Otrosí No. ${doc.sequenceNumber}` : 'Contrato';
  const result = await sendContractSignatureEmail({
    to: employee.email, employeeName: employee.name, documentLabel, projectName: project?.name || '', signUrl,
  });
  if (!result.ok) {
    console.error(`[contractSignatureService] El correo de firma para "${employee.email}" (documento ${doc.id}) NO se pudo enviar: ${result.error}`);
  }
  return { doc, emailSent: result.ok, emailError: result.ok ? null : result.error, signUrl };
}

// Estado de un link de firma: 'firmado' siempre gana (el token se conserva después de firmar para
// que la persona pueda seguir viendo/descargando su copia, ver comentario en el modelo) — solo se
// mira la expiración si TODAVÍA no se firmó.
async function getSignableDocument(rawToken) {
  const doc = await adminModels.EmployeeContractDocument.findOne({
    where: { signatureTokenHash: hashToken(rawToken) }, hooks: false,
  });
  if (!doc) throw new ApiError(404, 'Enlace no válido.');
  if (doc.signatureStatus === 'firmado') return { doc, status: 'firmado' };
  if (!doc.signatureTokenExpiresAt || doc.signatureTokenExpiresAt < new Date()) return { doc, status: 'vencido' };
  return { doc, status: 'pendiente' };
}

// Firma: reconstruye el mismo `content` con el que se generó el documento original, a partir de
// los datos YA guardados en el propio EmployeeContractDocument (objectAtIssue/valueAtIssue/
// effectiveFrom/effectiveTo) — nunca vuelve a leer la ficha del trabajador, que pudo cambiar desde
// que se generó. Para un otrosí, `changes` (el delta contra el documento padre) se deriva
// comparando doc contra su parent, igual criterio que generateOtrosi al crearlo. El PDF resultante
// agrega, al final del mismo documento, un bloque de certificación con la firma + metadatos (ver
// generateContractPdf en pdfService.js) y se guarda aparte en signedPdfFilePath — pdfFilePath (el
// original sin firmar) queda intacto.
async function signDocument({ rawToken, signatureDataUrl, signerName, ip, userAgent }) {
  const { doc, status } = await getSignableDocument(rawToken);
  if (status === 'firmado') throw new ApiError(400, 'Este documento ya fue firmado.');
  if (status === 'vencido') throw new ApiError(400, 'Este enlace venció. Pide que te envíen uno nuevo.');
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios.');
  }

  const employee = await adminModels.Employee.findByPk(doc.employeeId, { hooks: false });
  if (!employee) throw new ApiError(404, 'Trabajador no encontrado.');
  const project = await adminModels.Project.findByPk(employee.projectId, { hooks: false });
  const company = await resolveLetterheadForSigning(doc, project);

  let ctxDoc = doc.toJSON();
  let changes;
  if (doc.kind === 'otrosi' && doc.parentDocumentId) {
    const parent = await adminModels.EmployeeContractDocument.findByPk(doc.parentDocumentId, { hooks: false });
    ctxDoc = { ...ctxDoc, parent };
    changes = {
      newContractObject: doc.objectAtIssue !== parent.objectAtIssue ? doc.objectAtIssue : undefined,
      newEndDate: String(doc.effectiveTo || '') !== String(parent.effectiveTo || '') ? doc.effectiveTo : undefined,
      newSalaryValue: Number(doc.valueAtIssue) !== Number(parent.valueAtIssue) ? doc.valueAtIssue : undefined,
    };
  }

  const content = buildContractContent({ employee, company, project, doc: ctxDoc, changes });
  content.signDate = formatDateEs(new Date().toISOString().slice(0, 10));

  const signedAt = new Date();
  const pdfDoc = generateContractPdf(content, company, {
    dataUrl: signatureDataUrl, signerName: String(signerName).trim(), signedAt, ip,
  });
  const pdfBuffer = await pdfDocToBuffer(pdfDoc);
  const base = `${doc.employeeId}-${doc.kind}-${doc.sequenceNumber}-firmado-${Date.now()}`;
  const signedPdfFilePath = saveGeneratedFile(doc.companyId, 'employee-contracts-generated', `${base}.pdf`, pdfBuffer);

  doc.signedPdfFilePath = signedPdfFilePath;
  doc.signatureStatus = 'firmado';
  doc.signedAt = signedAt;
  doc.signerIp = ip || null;
  doc.signerUserAgent = userAgent ? String(userAgent).slice(0, 255) : null;
  await doc.save();
  return doc;
}

module.exports = { requestSignature, getSignableDocument, signDocument };
