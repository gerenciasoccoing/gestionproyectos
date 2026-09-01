const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Company } = require('../models');
// La búsqueda del login es la única del sistema que no puede tener companyId en el where (es
// justo lo que resuelve) — con la Capa 2 (RLS) activa, la conexión normal de la app ya no puede
// ver NINGUNA fila de "Users" sin ese filtro (antes solo era un problema a nivel de hooks, ahora
// también a nivel de PostgreSQL). Se usa la conexión de administración, exenta de RLS, solo para
// esta consulta puntual — mismo espíritu que hooks:false, ahora también en la Capa 2.
// forgot/reset-password son endpoints públicos con el mismo problema (sin sesión, sin companyId de
// contexto), así que también resuelven contra la conexión de administración — PasswordResetToken
// está excluido del aislamiento multi-tenant por esta misma razón (ver defineModels.js).
const { User: AdminUser, Role: AdminRole, Permission: AdminPermission, PasswordResetToken: AdminPasswordResetToken } = require('../models/adminModels');
const { sendPasswordResetEmail } = require('../services/emailService');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function frontendUrl(path) {
  const base = (process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${path}`;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, companyId: user.companyId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email y contraseña son obligatorios');

  // hooks:false: este es justamente el punto que resuelve a qué empresa pertenece el usuario —
  // todavía no hay companyId de contexto. Seguro porque email es único en toda la plataforma (un
  // usuario pertenece a una sola empresa) y porque después de este login, cada petición queda
  // anclada a esa empresa vía el JWT (ver middleware/auth.js) — este es el único lugar del código
  // donde se busca un usuario sin ese filtro.
  const user = await AdminUser.findOne({
    where: { email },
    include: [{ model: AdminRole, include: [AdminPermission] }],
    hooks: false,
  });
  if (!user || !user.active) throw new ApiError(401, 'Credenciales inválidas');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Credenciales inválidas');

  const company = await Company.findByPk(user.companyId);
  if (!company || !company.active) throw new ApiError(403, 'Esta empresa no tiene acceso activo. Contacta al administrador de la plataforma.');

  const token = signToken(user);
  const permissions = [...new Set(
    user.Roles.flatMap((r) => r.Permissions.map((p) => `${p.module}:${p.action}`))
  )];

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.Roles.map((r) => r.name),
      permissions,
      enabledFeatures: company.enabledFeatures || [],
    },
  });
});

// Siempre responde con el mismo mensaje genérico exista o no ese correo (evita que alguien use
// este endpoint para averiguar qué correos están registrados) — eso es a propósito y se mantiene.
// Lo que NO debe quedar en silencio es el diagnóstico del lado del servidor: antes ni siquiera se
// miraba el resultado de sendPasswordResetEmail (podía fallar — Resend caído, dominio remitente sin
// verificar, RESEND_API_KEY vencida — y no quedaba ningún rastro de cuál de los dos casos ocurrió:
// "no se encontró/no está activo" vs. "se encontró pero el envío falló"). Ambos casos ahora quedan
// en el log del servidor (nunca en la respuesta al cliente).
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, 'El correo es obligatorio');

  const genericResponse = { message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.' };

  const user = await AdminUser.findOne({ where: { email }, hooks: false });
  if (!user || !user.active) {
    console.log(`[forgotPassword] Solicitud para "${email}": no hay un usuario activo con ese correo (o no existe). No se envía nada.`);
    return res.json(genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  await AdminPasswordResetToken.create({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const result = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl: frontendUrl(`/reset-password/${rawToken}`),
  });
  if (!result.ok) {
    // El token ya quedó creado en base de datos (sigue siendo válido si se reenvía el correo a
    // mano), pero el usuario nunca lo va a recibir — esto es justo lo que hay que poder ver en
    // logs para diagnosticar un "no me llegó el correo" reportado por un usuario real.
    console.error(`[forgotPassword] El correo de recuperación para "${user.email}" NO se pudo enviar: ${result.error}`);
  }

  res.json(genericResponse);
});

// Válido una sola vez y solo dentro de la 1 hora de emitido (ver forgotPassword). El token nunca se
// guarda en claro: se busca por el hash del que llega en la URL.
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw new ApiError(400, 'token y password son obligatorios');
  if (password.length < 8) throw new ApiError(400, 'La contraseña debe tener al menos 8 caracteres');

  const record = await AdminPasswordResetToken.findOne({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiError(400, 'El enlace no es válido o ya venció. Solicita uno nuevo.');
  }

  const user = await AdminUser.findByPk(record.userId, { hooks: false });
  if (!user || !user.active) throw new ApiError(400, 'El enlace no es válido o ya venció. Solicita uno nuevo.');

  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save({ hooks: false });
  record.usedAt = new Date();
  await record.save();

  res.json({ message: 'Contraseña actualizada. Ya puedes ingresar con tu nueva contraseña.' });
});

const me = asyncHandler(async (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    roles: req.user.roles,
    permissions: [...req.user.permissions],
    isAdmin: req.user.isAdmin,
    projectIds: req.user.projectIds,
    enabledFeatures: req.user.enabledFeatures,
  });
});

module.exports = { login, forgotPassword, resetPassword, me };
