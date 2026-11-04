const crypto = require('crypto');
const path = require('path');
const { saveGeneratedFile, UPLOAD_ROOT } = require('../middleware/upload');
// requestExternalSignature/signInApp se llaman siempre autenticados (desde Gastos/Cajas, con la
// empresa ya resuelta por el JWT) — usan la conexión normal, con RLS activo, igual que el resto de
// la app. getSignableSlot/signExternal, en cambio, los llama un desconocido sin sesión que llega
// con un token en la URL — mismo criterio que contractSignatureService.js: se resuelven con la
// conexión de administración (exenta de RLS).
const { VoucherSignature, Expense, CashBoxMovement } = require('../models');
const adminModels = require('../models/adminModels');
const ApiError = require('../utils/ApiError');
const { sendVoucherSignatureEmail } = require('./emailService');

const SIGNATURE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // mismo plazo que contractSignatureService.js

// Roles firmables por tipo de comprobante (ver tarea): un gasto (comprobante de egreso) se firma
// como "Elaboró"/"Aprobó"/"Recibí conforme"; un ingreso (comprobante de ingreso) como
// "Entregó"/"Recibió" — exactamente las líneas de firma que ya dibuja pdfService.js, ahora también
// firmables digitalmente en vez de solo impresas en blanco.
const ROLES_BY_VOUCHER_TYPE = {
  gasto: ['elaboro', 'aprobo', 'recibi_conforme'],
  ingreso: ['entrego', 'recibio'],
};

const ROLE_LABELS = {
  elaboro: 'Elaboró', aprobo: 'Aprobó', recibi_conforme: 'Recibí conforme',
  entrego: 'Entregó', recibio: 'Recibió',
};

function assertValidRole(voucherType, role) {
  const roles = ROLES_BY_VOUCHER_TYPE[voucherType];
  if (!roles) throw new ApiError(400, 'voucherType debe ser gasto o ingreso');
  if (!roles.includes(role)) throw new ApiError(400, `role debe ser uno de: ${roles.join(', ')}`);
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function frontendUrl(urlPath) {
  const base = (process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${urlPath}`;
}

function voucherLabelFor(voucherType, voucher) {
  return voucherType === 'gasto'
    ? `Comprobante de egreso No. ${voucher.expenseNumber || voucher.id.slice(0, 8).toUpperCase()}`
    : `Comprobante de ingreso No. ${voucher.incomeNumber || voucher.id.slice(0, 8).toUpperCase()}`;
}

// Un gasto o un ingreso, por la conexión que corresponda — paranoid:false porque hasta un
// comprobante anulado necesita poder localizarse (para rechazar la firma con un mensaje claro en
// vez de un 404 genérico).
async function loadVoucher(voucherType, voucherId, { admin = false } = {}) {
  const ExpenseModel = admin ? adminModels.Expense : Expense;
  const MovementModel = admin ? adminModels.CashBoxMovement : CashBoxMovement;
  const Model = voucherType === 'gasto' ? ExpenseModel : MovementModel;
  const options = admin ? { paranoid: false, hooks: false } : { paranoid: false };
  const voucher = await Model.findByPk(voucherId, options);
  if (!voucher) throw new ApiError(404, voucherType === 'gasto' ? 'Gasto no encontrado' : 'Ingreso no encontrado');
  return voucher;
}

function saveSignatureImage(companyId, voucherId, role, signatureDataUrl) {
  const base64 = signatureDataUrl.split(',')[1] || signatureDataUrl;
  const buffer = Buffer.from(base64, 'base64');
  return saveGeneratedFile(companyId, 'voucher-signatures', `${voucherId}-${role}-${Date.now()}.png`, buffer);
}

// Firma dentro de la app: quien firma ya está autenticado (un usuario con permiso de edición sobre
// Gastos/Cajas), así que no hace falta enlace ni correo — se firma de una, con el mismo dibujo a
// mano (canvas) que el link público.
async function signInApp({ voucherType, voucherId, role, signatureDataUrl, signerName, userId, ip, userAgent }) {
  assertValidRole(voucherType, role);
  const voucher = await loadVoucher(voucherType, voucherId);
  if (voucher.deletedAt) throw new ApiError(400, 'Este comprobante está anulado y no puede firmarse');
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios');
  }

  const [signature] = await VoucherSignature.findOrCreate({
    where: { voucherType, voucherId, role },
    defaults: { createdBy: userId },
  });
  if (signature.status === 'firmado') throw new ApiError(400, 'Este rol ya fue firmado');

  signature.signerName = String(signerName).trim();
  signature.signaturePath = saveSignatureImage(voucher.companyId, voucherId, role, signatureDataUrl);
  signature.status = 'firmado';
  signature.signedAt = new Date();
  signature.signerIp = ip || null;
  signature.signerUserAgent = userAgent ? String(userAgent).slice(0, 255) : null;
  signature.signedByUserId = userId;
  await signature.save();
  return signature;
}

// Genera (o regenera) el link de firma público de un rol y, si se dio un correo, lo envía — mismo
// respaldo que contractSignatureService.js#requestSignature: devuelve siempre signUrl aunque el
// correo falle, para que quien lo pidió pueda copiarlo y mandarlo a mano.
async function requestExternalSignature({ voucherType, voucherId, role, email, userId }) {
  assertValidRole(voucherType, role);
  const voucher = await loadVoucher(voucherType, voucherId);
  if (voucher.deletedAt) throw new ApiError(400, 'Este comprobante está anulado y no puede firmarse');

  const [signature] = await VoucherSignature.findOrCreate({
    where: { voucherType, voucherId, role },
    defaults: { createdBy: userId },
  });
  if (signature.status === 'firmado') throw new ApiError(400, 'Este rol ya fue firmado');

  const rawToken = crypto.randomBytes(32).toString('base64url');
  signature.signatureTokenHash = hashToken(rawToken);
  signature.signatureTokenExpiresAt = new Date(Date.now() + SIGNATURE_TOKEN_TTL_MS);
  await signature.save();

  const signUrl = frontendUrl(`/sign-voucher/${rawToken}`);
  let emailSent = false;
  let emailError = null;
  if (email) {
    const result = await sendVoucherSignatureEmail({
      to: email, roleLabel: ROLE_LABELS[role], voucherLabel: voucherLabelFor(voucherType, voucher), signUrl,
    });
    emailSent = result.ok;
    emailError = result.ok ? null : result.error;
  }
  return { signUrl, emailSent, emailError };
}

// Estado de un link de firma: mismo criterio que contractSignatureService.js#getSignableDocument
// ('firmado' siempre gana; la expiración solo se mira si todavía no se firmó).
async function getSignableSlot(rawToken) {
  const signature = await adminModels.VoucherSignature.findOne({
    where: { signatureTokenHash: hashToken(rawToken) }, hooks: false,
  });
  if (!signature) throw new ApiError(404, 'Enlace no válido.');
  if (signature.status === 'firmado') return { signature, status: 'firmado' };
  if (!signature.signatureTokenExpiresAt || signature.signatureTokenExpiresAt < new Date()) return { signature, status: 'vencido' };
  return { signature, status: 'pendiente' };
}

// Mismo criterio que contractSignatureService.js#resolveLetterheadForSigning: quien abre el enlace
// público no tiene ninguna empresa de contexto (no pasó por authenticate), así que no puede usar
// letterheadService.js#getLetterheadForProject (depende de getCurrentCompanyId()) — se resuelve a
// mano con la conexión de administración, usando voucher.companyId (ya sabido, sin ambigüedad) en
// vez de esa resolución por contexto.
async function resolveLetterheadAdmin(voucher, project) {
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
  const company = await adminModels.Company.findByPk(voucher.companyId, { hooks: false });
  if (!company) return null;
  return {
    companyName: company.companyName, nit: company.nit, address: company.address,
    phone: company.phone, managerName: company.managerName,
    logoPath: company.logoPath ? path.join(UPLOAD_ROOT, company.logoPath) : null,
  };
}

// Reúne todo lo que necesita la página pública de firma (ver publicVoucherSignatureController.js):
// el estado del enlace, el comprobante completo (con sus asociaciones, para poder generar el MISMO
// PDF en vivo que ve cualquier usuario autenticado) y las firmas YA registradas de los demás roles
// (para que quien firma vea el comprobante tal como está, no una versión "en blanco").
async function getVoucherPdfIngredients(rawToken) {
  const { signature, status } = await getSignableSlot(rawToken);
  const voucher = await loadVoucher(signature.voucherType, signature.voucherId, { admin: true });

  let full;
  if (signature.voucherType === 'gasto') {
    full = await adminModels.Expense.findByPk(signature.voucherId, {
      include: [
        { model: adminModels.ThirdParty, as: 'supplierParty', attributes: ['id', 'name'] },
        { model: adminModels.AdminExpenseCategory, as: 'adminCategory', attributes: ['id', 'name'] },
        { model: adminModels.CashBox, attributes: ['id', 'name'] },
        { model: adminModels.Project, attributes: ['id', 'name', 'contractNumber', 'consortiumId'] },
      ],
      paranoid: false, hooks: false,
    });
  } else {
    full = await adminModels.CashBoxMovement.findByPk(signature.voucherId, {
      include: [
        { model: adminModels.CashBoxMovementWithholding, as: 'withholdings' },
        { model: adminModels.Project, attributes: ['id', 'name', 'contractNumber', 'consortiumId'] },
        { model: adminModels.User, attributes: ['id', 'name'] },
        { model: adminModels.CashBox, attributes: ['id', 'name'] },
      ],
      paranoid: false, hooks: false,
    });
  }

  const company = await resolveLetterheadAdmin(voucher, full.Project || null);
  const signatures = await adminModels.VoucherSignature.findAll({
    where: { voucherType: signature.voucherType, voucherId: signature.voucherId }, hooks: false,
  });
  return { signature, status, voucherType: signature.voucherType, full, company, signatures: signatures.map((s) => s.toJSON()) };
}

async function signExternal({ rawToken, signatureDataUrl, signerName, ip, userAgent }) {
  const { signature, status } = await getSignableSlot(rawToken);
  if (status === 'firmado') throw new ApiError(400, 'Este comprobante ya fue firmado.');
  if (status === 'vencido') throw new ApiError(400, 'Este enlace venció. Pide que te envíen uno nuevo.');
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios.');
  }

  const voucher = await loadVoucher(signature.voucherType, signature.voucherId, { admin: true });
  if (voucher.deletedAt) throw new ApiError(400, 'Este comprobante fue anulado y no puede firmarse.');

  signature.signerName = String(signerName).trim();
  signature.signaturePath = saveSignatureImage(signature.companyId, signature.voucherId, signature.role, signatureDataUrl);
  signature.status = 'firmado';
  signature.signedAt = new Date();
  signature.signerIp = ip || null;
  signature.signerUserAgent = userAgent ? String(userAgent).slice(0, 255) : null;
  await signature.save();
  return signature;
}

module.exports = {
  ROLES_BY_VOUCHER_TYPE, ROLE_LABELS, assertValidRole, voucherLabelFor, loadVoucher,
  signInApp, requestExternalSignature, getSignableSlot, signExternal, getVoucherPdfIngredients,
};
