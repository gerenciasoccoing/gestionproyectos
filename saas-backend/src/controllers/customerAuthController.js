const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Customer } = require('../models');
const { signCustomerToken } = require('../middleware/auth');

// Cuentas de cliente final, siempre scoped al tenant resuelto por req.tenant (subdominio/dominio).
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password) throw new ApiError(400, 'Nombre, email y contraseña son obligatorios');

  const existing = await Customer.findOne({ where: { tenantId: req.tenant.id, email } });
  if (existing) throw new ApiError(409, 'Ya existe una cuenta con este email');

  const passwordHash = await bcrypt.hash(password, 10);
  const customer = await Customer.create({
    tenantId: req.tenant.id, name, email, phone, address, passwordHash,
  });

  const token = signCustomerToken(customer);
  res.status(201).json({ token, customer: { id: customer.id, name: customer.name, email: customer.email } });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email y contraseña son obligatorios');

  const customer = await Customer.findOne({ where: { tenantId: req.tenant.id, email } });
  if (!customer || !customer.active) throw new ApiError(401, 'Credenciales inválidas');

  const valid = await bcrypt.compare(password, customer.passwordHash);
  if (!valid) throw new ApiError(401, 'Credenciales inválidas');

  const token = signCustomerToken(customer);
  res.json({ token, customer: { id: customer.id, name: customer.name, email: customer.email } });
});

const me = asyncHandler(async (req, res) => {
  res.json(req.customer);
});

module.exports = { register, login, me };
