const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { PlatformAdmin, Company, User, Project, Role, SupportAccessLog, CompanyRegistrationRequest, PasswordResetToken } = require('../models');
// Este controlador atiende con un token de operador de plataforma, que nunca trae companyId (ver
// signToken) — con la Capa 2 (RLS) activa, cualquier consulta a un modelo tenant-scoped (User,
// Project...) desde la conexión restringida sin ese contexto devuelve 0 filas sin importar
// hooks:false (eso solo salta el filtro de la Capa 1, RLS es independiente). listCompanies agrega
// datos de TODAS las empresas a la vez, así que usa la conexión de administración (exenta de RLS)
// en vez de abrir una transacción runWithCompany por cada una.
const { User: AdminUser, Project: AdminProject } = require('../models/adminModels');
const { provisionCompany } = require('../services/companyProvisioningService');
const { runWithCompany } = require('../utils/tenantContext');
const { sendPasswordResetEmail, sendCompanyRejectedEmail } = require('../services/emailService');

function frontendUrl(path) {
  const base = (process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${path}`;
}

function signToken(admin) {
  // Sin companyId a propósito: es lo que distingue este token de uno de usuario normal (ver
  // middleware/auth.js y middleware/platformAdminAuth.js) y evita que uno pueda usarse en lugar
  // del otro. Vida más corta que la de un usuario normal por ser una cuenta de mayor alcance.
  return jwt.sign({ sub: admin.id, type: 'platform_admin' }, process.env.JWT_SECRET, { expiresIn: '4h' });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email y contraseña son obligatorios');

  const admin = await PlatformAdmin.findOne({ where: { email } });
  if (!admin || !admin.active) throw new ApiError(401, 'Credenciales inválidas');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw new ApiError(401, 'Credenciales inválidas');

  res.json({ token: signToken(admin), admin: { id: admin.id, name: admin.name, email: admin.email } });
});

// Empresas con un conteo básico de usuarios, para que el panel pueda mostrar algo más que el
// nombre sin tener que abrir una petición aparte por cada fila.
const listCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.findAll({ order: [['createdAt', 'ASC']], hooks: false });
  const userCounts = await AdminUser.findAll({
    attributes: ['companyId', [AdminUser.sequelize.fn('COUNT', AdminUser.sequelize.col('id')), 'count']],
    group: ['companyId'],
    hooks: false,
    raw: true,
  });
  const countByCompany = Object.fromEntries(userCounts.map((r) => [r.companyId, Number(r.count)]));

  const activeProjectCounts = await AdminProject.findAll({
    attributes: ['companyId', [AdminProject.sequelize.fn('COUNT', AdminProject.sequelize.col('id')), 'count']],
    where: { status: 'activo' },
    group: ['companyId'],
    hooks: false,
    raw: true,
  });
  const activeProjectCountByCompany = Object.fromEntries(activeProjectCounts.map((r) => [r.companyId, Number(r.count)]));

  res.json(companies.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    nit: c.nit,
    contactEmail: c.contactEmail,
    active: c.active,
    planTier: c.planTier,
    maxUsers: c.maxUsers,
    maxActiveProjects: c.maxActiveProjects,
    userCount: countByCompany[c.id] || 0,
    activeProjectCount: activeProjectCountByCompany[c.id] || 0,
    createdAt: c.createdAt,
  })));
});

const createCompany = asyncHandler(async (req, res) => {
  const { companyName, nit, address, phone, contactEmail, adminName, adminEmail, adminPassword } = req.body;
  const { company, admin } = await provisionCompany({
    companyName, nit, address, phone, contactEmail, adminName, adminEmail, adminPassword,
  });
  res.status(201).json({
    company: { id: company.id, companyName: company.companyName },
    admin: { id: admin.id, email: admin.email },
  });
});

// Activar/desactivar: una empresa inactiva no puede iniciar sesión (ver authController.login),
// pero sus datos quedan intactos — es reversible, no un borrado.
const setCompanyStatus = asyncHandler(async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active debe ser true o false');

  const company = await Company.findByPk(req.params.id, { hooks: false });
  if (!company) throw new ApiError(404, 'Empresa no encontrada');

  await company.update({ active });
  res.json({ id: company.id, companyName: company.companyName, active: company.active });
});

// Esqueleto de planes/límites (ver diseño multi-tenant): sin cobro ni enforcement duro todavía,
// solo el tope blando que aplican userController.create/projectController.create (ver esos
// archivos) contra maxUsers/maxActiveProjects. planTier es hoy una simple etiqueta libre — no hay
// catálogo de planes fijo ni lógica que dependa de su valor.
const updateCompanyPlan = asyncHandler(async (req, res) => {
  const { planTier, maxUsers, maxActiveProjects } = req.body;

  const company = await Company.findByPk(req.params.id, { hooks: false });
  if (!company) throw new ApiError(404, 'Empresa no encontrada');

  const updates = {};
  if (planTier !== undefined) updates.planTier = planTier;
  if (maxUsers !== undefined) updates.maxUsers = maxUsers === null || maxUsers === '' ? null : Number(maxUsers);
  if (maxActiveProjects !== undefined) {
    updates.maxActiveProjects = maxActiveProjects === null || maxActiveProjects === '' ? null : Number(maxActiveProjects);
  }
  if (Object.values(updates).some((v) => v !== null && Number.isNaN(v))) {
    throw new ApiError(400, 'maxUsers y maxActiveProjects deben ser números o vacíos (sin límite)');
  }

  await company.update(updates);
  res.json({
    id: company.id,
    companyName: company.companyName,
    planTier: company.planTier,
    maxUsers: company.maxUsers,
    maxActiveProjects: company.maxActiveProjects,
  });
});

// Acceso de soporte auditado: entra a la sesión de una empresa como su usuario administrador, sin
// necesitar su contraseña. Cada uso queda registrado (SupportAccessLog) con quién, a qué empresa,
// como qué usuario y por qué (reason es opcional, pero se guarda si se manda). El token que se
// entrega es un token de USUARIO normal (mismo shape que authController.signToken) — no hay ningún
// mecanismo especial de "modo soporte" en el resto de la app, así que la sesión resultante se
// comporta exactamente como si el administrador de esa empresa hubiera iniciado sesión — con la
// diferencia de que dura 30 minutos en vez de 8 horas, para acotar la ventana de exposición.
const impersonateCompany = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const company = await Company.findByPk(req.params.id, { hooks: false });
  if (!company) throw new ApiError(404, 'Empresa no encontrada');
  if (!company.active) throw new ApiError(403, 'La empresa está inactiva');

  const admin = await runWithCompany(company.id, async () => {
    const adminRole = await Role.findOne({ where: { name: 'admin', companyId: company.id } });
    if (!adminRole) return null;
    return User.findOne({ where: { active: true }, include: [{ model: Role, where: { id: adminRole.id } }] });
  });
  if (!admin) throw new ApiError(404, 'La empresa no tiene un usuario administrador activo');

  await SupportAccessLog.create({
    platformAdminId: req.platformAdmin.id,
    platformAdminName: req.platformAdmin.name,
    companyId: company.id,
    companyName: company.companyName,
    impersonatedUserEmail: admin.email,
    reason: reason || null,
  });

  const token = jwt.sign({ sub: admin.id, companyId: company.id }, process.env.JWT_SECRET, { expiresIn: '30m' });
  res.json({ token, impersonatedUser: { name: admin.name, email: admin.email }, companyName: company.companyName });
});

const listSupportAccessLog = asyncHandler(async (req, res) => {
  const logs = await SupportAccessLog.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
  res.json(logs);
});

// Bandeja de solicitudes de registro (formulario público "Registrar empresa" del login). Por
// defecto solo las pendientes, ?status=approved|rejected|all para revisar el historial.
const listRegistrationRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = status && status !== 'all' ? { status } : { status: 'pending' };
  const requests = await CompanyRegistrationRequest.findAll({ where, order: [['createdAt', 'ASC']] });
  res.json(requests);
});

// Aprobar: dispara el mismo alta que createCompany (provisionCompany), pero sin contraseña elegida
// por nadie — se genera una inutilizable y se manda al admin un enlace de "definir tu contraseña"
// (mismo mecanismo de un solo uso que forgot-password). companyName/nit/contactEmail vienen de la
// solicitud tal cual se registraron; el nombre del admin es el nombre del contacto.
const approveRegistrationRequest = asyncHandler(async (req, res) => {
  const request = await CompanyRegistrationRequest.findByPk(req.params.id);
  if (!request) throw new ApiError(404, 'Solicitud no encontrada');
  if (request.status !== 'pending') throw new ApiError(400, 'Esta solicitud ya fue revisada');

  const { company, admin } = await provisionCompany({
    companyName: request.companyName,
    nit: request.nit,
    phone: request.phone,
    contactEmail: request.contactEmail,
    adminName: request.contactName,
    adminEmail: request.contactEmail,
  });

  request.status = 'approved';
  request.decidedAt = new Date();
  request.decidedBy = req.platformAdmin.id;
  request.companyId = company.id;
  await request.save();

  const rawToken = crypto.randomBytes(32).toString('base64url');
  await PasswordResetToken.create({
    userId: admin.id,
    tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await sendPasswordResetEmail({
    to: admin.email,
    name: admin.name,
    resetUrl: frontendUrl(`/reset-password/${rawToken}`),
    isFirstAccess: true,
  });

  res.json({
    company: { id: company.id, companyName: company.companyName },
    admin: { id: admin.id, email: admin.email },
  });
});

// Rechazar: no crea nada, solo marca la solicitud y avisa al solicitante (mensaje genérico salvo
// que el operador escriba un motivo). El correo sigue sin poder usarse para ingresar (nunca se
// creó un User).
const rejectRegistrationRequest = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const request = await CompanyRegistrationRequest.findByPk(req.params.id);
  if (!request) throw new ApiError(404, 'Solicitud no encontrada');
  if (request.status !== 'pending') throw new ApiError(400, 'Esta solicitud ya fue revisada');

  request.status = 'rejected';
  request.rejectionReason = reason || null;
  request.decidedAt = new Date();
  request.decidedBy = req.platformAdmin.id;
  await request.save();

  await sendCompanyRejectedEmail({ to: request.contactEmail, companyName: request.companyName, reason });

  res.json({ id: request.id, status: request.status });
});

module.exports = {
  login, listCompanies, createCompany, setCompanyStatus, updateCompanyPlan,
  impersonateCompany, listSupportAccessLog,
  listRegistrationRequests, approveRegistrationRequest, rejectRegistrationRequest,
};
