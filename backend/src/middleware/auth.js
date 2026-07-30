const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { User, Role, Permission } = require('../models');

// Verifica el JWT y adjunta a req.user: { id, name, email, isAdmin, permissions: Set('modulo:accion'), projectIds }
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    // Además del header Authorization, se acepta ?token= en query string exclusivamente para
    // poder incrustar archivos protegidos (fotos, logo) en etiquetas <img>, que no admiten headers.
    const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token || null;
    if (!token) throw new ApiError(401, 'Token no proporcionado');

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(payload.sub, {
      include: [
        { model: Role, include: [Permission] },
        { model: require('../models').Project, attributes: ['id'] },
      ],
    });
    if (!user || !user.active) throw new ApiError(401, 'Usuario inválido o inactivo');

    const permissions = new Set();
    let isAdmin = false;
    user.Roles.forEach((role) => {
      if (role.name === 'admin') isAdmin = true;
      role.Permissions.forEach((p) => permissions.add(`${p.module}:${p.action}`));
    });

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin,
      permissions,
      roles: user.Roles.map((r) => r.name),
      projectIds: user.Projects.map((p) => p.id),
    };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Token inválido o expirado'));
  }
}

module.exports = { authenticate };
