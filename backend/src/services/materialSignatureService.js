const crypto = require('crypto');
const { saveGeneratedFile } = require('../middleware/upload');
// signInApp/requestExternalSignature se llaman siempre autenticados (desde Traslados/Salidas/
// Devoluciones, con la empresa ya resuelta por el JWT) — usan la conexión normal, con RLS activo.
// getSignableSlot/signOrReject los llama un desconocido sin sesión que llega con un token en la
// URL — se resuelven con la conexión de administración (exenta de RLS), mismo criterio que
// voucherSignatureService.js/contractSignatureService.js.
const { MaterialMovementSignature, MaterialTransfer, MaterialIssue, MaterialReturn } = require('../models');
const adminModels = require('../models/adminModels');
const ApiError = require('../utils/ApiError');
const { sendVoucherSignatureEmail } = require('./emailService');
const { sendWhatsAppMessage } = require('./whatsappService');

const SIGNATURE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // mismo plazo que voucherSignatureService.js

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function frontendUrl(urlPath) {
  const base = (process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${urlPath}`;
}

function saveSignatureImage(companyId, movementId, movementType, signatureDataUrl) {
  const base64 = signatureDataUrl.split(',')[1] || signatureDataUrl;
  const buffer = Buffer.from(base64, 'base64');
  return saveGeneratedFile(companyId, 'material-signatures', `${movementType}-${movementId}-${Date.now()}.png`, buffer);
}

// Registro de "cómo cargar cada tipo de movimiento" — cada fase (traslados/salidas/devoluciones)
// agrega la suya acá, sin tocar el resto de este servicio. { model, adminModel, label(movement) }.
const MOVEMENT_LOADERS = {
  traslado: {
    model: () => MaterialTransfer,
    adminModel: () => adminModels.MaterialTransfer,
    label: (m) => `Traslado de material No. ${m.transferNumber || m.id.slice(0, 8).toUpperCase()}`,
  },
  salida: {
    model: () => MaterialIssue,
    adminModel: () => adminModels.MaterialIssue,
    label: (m) => `Salida de material No. ${m.issueNumber ? `${m.contractPrefix ? `${m.contractPrefix}-` : ''}${m.issueNumber}` : m.id.slice(0, 8).toUpperCase()}`,
  },
  devolucion: {
    model: () => MaterialReturn,
    adminModel: () => adminModels.MaterialReturn,
    label: (m) => `Devolución de material No. ${m.returnNumber ? `${m.contractPrefix ? `${m.contractPrefix}-` : ''}${m.returnNumber}` : m.id.slice(0, 8).toUpperCase()}`,
  },
};

async function loadMovement(movementType, movementId, { admin = false } = {}) {
  const loader = MOVEMENT_LOADERS[movementType];
  if (!loader) throw new ApiError(400, `movementType inválido: ${movementType}`);
  const Model = admin ? loader.adminModel() : loader.model();
  const options = admin ? { hooks: false } : {};
  const movement = await Model.findByPk(movementId, options);
  if (!movement) throw new ApiError(404, 'Movimiento no encontrado');
  return movement;
}

function movementLabel(movementType, movement) {
  return MOVEMENT_LOADERS[movementType].label(movement);
}

// Firma (o rechazo) dentro de la app: quien confirma ya está autenticado (usuario con permiso de
// edición sobre el módulo correspondiente), así que se resuelve de una, sin enlace ni correo.
async function signInApp({ movementType, movementId, signatureDataUrl, signerName, userId, ip, userAgent }) {
  const movement = await loadMovement(movementType, movementId);
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios');
  }

  const [signature] = await MaterialMovementSignature.findOrCreate({
    where: { movementType, movementId },
    defaults: { createdBy: userId },
  });
  if (signature.status !== 'pendiente') throw new ApiError(400, 'Este movimiento ya fue resuelto');

  signature.signerName = String(signerName).trim();
  signature.signaturePath = saveSignatureImage(movement.companyId, movementId, movementType, signatureDataUrl);
  signature.status = 'firmado';
  signature.signedAt = new Date();
  signature.signerIp = ip || null;
  signature.signerUserAgent = userAgent ? String(userAgent).slice(0, 255) : null;
  signature.signedByUserId = userId;
  await signature.save();
  return signature;
}

async function rejectInApp({ movementType, movementId, rejectionReason, userId }) {
  await loadMovement(movementType, movementId);
  if (!rejectionReason || !rejectionReason.trim()) throw new ApiError(400, 'rejectionReason es obligatorio');

  const [signature] = await MaterialMovementSignature.findOrCreate({
    where: { movementType, movementId },
    defaults: { createdBy: userId },
  });
  if (signature.status !== 'pendiente') throw new ApiError(400, 'Este movimiento ya fue resuelto');

  signature.status = 'rechazado';
  signature.rejectedAt = new Date();
  signature.rejectionReason = rejectionReason.trim();
  signature.signedByUserId = userId;
  await signature.save();
  return signature;
}

// Genera (o regenera) el enlace público y lo envía por correo y/o WhatsApp (ver especificación: "el
// enlace se envía por WhatsApp y correo") — devuelve siempre signUrl para poder copiarlo a mano
// aunque los dos envíos fallen (p. ej. LOROAPI_API_KEY/RESEND_API_KEY sin configurar).
async function requestExternalSignature({ movementType, movementId, email, phone, userId }) {
  const movement = await loadMovement(movementType, movementId);

  const [signature] = await MaterialMovementSignature.findOrCreate({
    where: { movementType, movementId },
    defaults: { createdBy: userId },
  });
  if (signature.status !== 'pendiente') throw new ApiError(400, 'Este movimiento ya fue resuelto');

  const rawToken = crypto.randomBytes(32).toString('base64url');
  signature.signatureTokenHash = hashToken(rawToken);
  signature.signatureTokenExpiresAt = new Date(Date.now() + SIGNATURE_TOKEN_TTL_MS);
  await signature.save();

  const signUrl = frontendUrl(`/sign-material/${rawToken}`);
  const label = movementLabel(movementType, movement);
  let emailSent = false;
  let emailError = null;
  if (email) {
    const result = await sendVoucherSignatureEmail({ to: email, roleLabel: 'Confirmación', voucherLabel: label, signUrl });
    emailSent = result.ok;
    emailError = result.ok ? null : result.error;
  }
  let whatsappSent = false;
  let whatsappError = null;
  if (phone) {
    const result = await sendWhatsAppMessage(phone, `Tienes un documento del Inventario de Materiales para confirmar: ${label}.\n\nRevisar y firmar: ${signUrl}\n\nEste enlace vence en 7 días.`);
    whatsappSent = result.ok;
    whatsappError = result.ok ? null : result.error;
  }
  return { signUrl, emailSent, emailError, whatsappSent, whatsappError };
}

async function getSignableSlot(rawToken) {
  const signature = await adminModels.MaterialMovementSignature.findOne({
    where: { signatureTokenHash: hashToken(rawToken) }, hooks: false,
  });
  if (!signature) throw new ApiError(404, 'Enlace no válido.');
  if (signature.status !== 'pendiente') return { signature, status: signature.status };
  if (!signature.signatureTokenExpiresAt || signature.signatureTokenExpiresAt < new Date()) return { signature, status: 'vencido' };
  return { signature, status: 'pendiente' };
}

async function signExternal({ rawToken, signatureDataUrl, signerName, ip, userAgent }) {
  const { signature, status } = await getSignableSlot(rawToken);
  if (status === 'firmado' || status === 'rechazado') throw new ApiError(400, 'Este movimiento ya fue resuelto.');
  if (status === 'vencido') throw new ApiError(400, 'Este enlace venció. Pide que te envíen uno nuevo.');
  if (!signatureDataUrl || !String(signerName || '').trim()) {
    throw new ApiError(400, 'signatureDataUrl y signerName son obligatorios.');
  }

  signature.signerName = String(signerName).trim();
  signature.signaturePath = saveSignatureImage(signature.companyId, signature.movementId, signature.movementType, signatureDataUrl);
  signature.status = 'firmado';
  signature.signedAt = new Date();
  signature.signerIp = ip || null;
  signature.signerUserAgent = userAgent ? String(userAgent).slice(0, 255) : null;
  await signature.save();
  return signature;
}

async function rejectExternal({ rawToken, rejectionReason, ip, userAgent }) {
  const { signature, status } = await getSignableSlot(rawToken);
  if (status === 'firmado' || status === 'rechazado') throw new ApiError(400, 'Este movimiento ya fue resuelto.');
  if (status === 'vencido') throw new ApiError(400, 'Este enlace venció. Pide que te envíen uno nuevo.');
  if (!rejectionReason || !rejectionReason.trim()) throw new ApiError(400, 'rejectionReason es obligatorio.');

  signature.status = 'rechazado';
  signature.rejectedAt = new Date();
  signature.rejectionReason = rejectionReason.trim();
  signature.signerIp = ip || null;
  signature.signerUserAgent = userAgent ? String(userAgent).slice(0, 255) : null;
  await signature.save();
  return signature;
}

module.exports = {
  loadMovement, movementLabel,
  signInApp, rejectInApp, requestExternalSignature, getSignableSlot, signExternal, rejectExternal,
};
