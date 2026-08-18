const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { PlatformAdmin, Company, User } = require('../models');
const { provisionCompany } = require('../services/companyProvisioningService');

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
  const userCounts = await User.findAll({
    attributes: ['companyId', [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']],
    group: ['companyId'],
    hooks: false,
    raw: true,
  });
  const countByCompany = Object.fromEntries(userCounts.map((r) => [r.companyId, Number(r.count)]));

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

module.exports = { login, listCompanies, createCompany, setCompanyStatus };
