const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');
const { signStaffToken } = require('../middleware/auth');

// Login de panel de un tenant (tenant_admin / tenant_operator). El tenant ya viene resuelto
// en req.tenant por el dominio/subdominio de la request, igual que en la tienda pública.
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email y contraseña son obligatorios');

  const user = await User.findOne({
    where: { email, tenantId: req.tenant.id, role: ['tenant_admin', 'tenant_operator'] },
  });
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

module.exports = { login };
