const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');
const { signStaffToken } = require('../middleware/auth');

// Login exclusivo del super-admin (dueño de la plataforma, tenantId null). El login de
// tenant_admin/tenant_operator vive en tenantAuthController y resuelve el tenant por
// dominio/subdominio, igual que el resto de la tienda.
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email y contraseña son obligatorios');

  const user = await User.findOne({ where: { email, tenantId: null, role: 'super_admin' } });
  if (!user || !user.active) throw new ApiError(401, 'Credenciales inválidas');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Credenciales inválidas');

  const token = signStaffToken(user);
  res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId,
    },
  });
});

const me = asyncHandler(async (req, res) => {
  res.json(req.staff);
});

module.exports = { login, me };
