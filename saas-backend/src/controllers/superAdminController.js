const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Tenant, User } = require('../models');

const listTenants = asyncHandler(async (req, res) => {
  const tenants = await Tenant.findAll({ order: [['createdAt', 'DESC']] });
  res.json(tenants);
});

const getTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByPk(req.params.id);
  if (!tenant) throw new ApiError(404, 'Tenant no encontrado');
  res.json(tenant);
});

// Alta de un tenant nuevo + su primer usuario tenant_admin, en una sola operación.
const createTenant = asyncHandler(async (req, res) => {
  const {
    name, nit, subdomain, plan, adminName, adminEmail, adminPassword,
  } = req.body;
  if (!name || !subdomain || !adminName || !adminEmail || !adminPassword) {
    throw new ApiError(400, 'name, subdomain, adminName, adminEmail y adminPassword son obligatorios');
  }

  const existing = await Tenant.findOne({ where: { subdomain } });
  if (existing) throw new ApiError(409, 'Ese subdominio ya está en uso');

  const tenant = await Tenant.create({ name, nit, subdomain, plan: plan || 'trial' });
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const adminUser = await User.create({
    tenantId: tenant.id, name: adminName, email: adminEmail, passwordHash, role: 'tenant_admin',
  });

  res.status(201).json({ tenant, adminUser: { id: adminUser.id, email: adminUser.email } });
});

const updateTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByPk(req.params.id);
  if (!tenant) throw new ApiError(404, 'Tenant no encontrado');

  const {
    name, nit, plan, customDomain, status,
  } = req.body;
  await tenant.update({
    ...(name !== undefined && { name }),
    ...(nit !== undefined && { nit }),
    ...(plan !== undefined && { plan }),
    ...(customDomain !== undefined && { customDomain: customDomain || null }),
    ...(status !== undefined && { status }),
  });

  res.json(tenant);
});

const setTenantStatus = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByPk(req.params.id);
  if (!tenant) throw new ApiError(404, 'Tenant no encontrado');
  if (!['active', 'suspended'].includes(req.body.status)) throw new ApiError(400, 'Estado inválido');

  await tenant.update({ status: req.body.status });
  res.json(tenant);
});

module.exports = {
  listTenants, getTenant, createTenant, updateTenant, setTenantStatus,
};
