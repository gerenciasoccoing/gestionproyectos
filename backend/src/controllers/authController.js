const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { User, Role, Permission } = require('../models');

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email y contraseña son obligatorios');

  const user = await User.findOne({
    where: { email },
    include: [{ model: Role, include: [Permission] }],
  });
  if (!user || !user.active) throw new ApiError(401, 'Credenciales inválidas');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, 'Credenciales inválidas');

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
    },
  });
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
  });
});

module.exports = { login, me };
