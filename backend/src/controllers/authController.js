const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { User, Role, Permission, Company } = require('../models');

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
  const user = await User.findOne({
    where: { email },
    include: [{ model: Role, include: [Permission] }],
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
