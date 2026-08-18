const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { User, Role, Permission, Company } = require('../models');
const { runWithCompany } = require('../utils/tenantContext');

// Verifica el JWT y adjunta a req.user: { id, name, email, isAdmin, permissions: Set('modulo:accion'), projectIds }.
// El companyId del token (puesto en el login, ver authController.signToken) ancla TODA la
// petición a esa empresa: se abre acá el contexto de aislamiento multi-tenant (ver
// tenantContext.js/applyTenantScoping.js) y se mantiene activo mientras dure la petición, porque
// next() se invoca desde adentro de runWithCompany — todo lo que corra después (el resto de
// middlewares, el controlador, cualquier consulta a un modelo de negocio) hereda ese contexto sin
// tener que pasarlo a mano.
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    // Además del header Authorization, se acepta ?token= en query string exclusivamente para
    // poder incrustar archivos protegidos (fotos, logo) en etiquetas <img>, que no admiten headers.
    const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token || null;
    if (!token) throw new ApiError(401, 'Token no proporcionado');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.companyId) throw new ApiError(401, 'Token inválido o expirado');

    await runWithCompany(payload.companyId, async () => {
      const company = await Company.findByPk(payload.companyId);
      if (!company || !company.active) throw new ApiError(403, 'Esta empresa no tiene acceso activo. Contacta al administrador de la plataforma.');

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
        companyId: payload.companyId,
        isAdmin,
        permissions,
        roles: user.Roles.map((r) => r.name),
        projectIds: user.Projects.map((p) => p.id),
      };
      next();
    });
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Token inválido o expirado'));
  }
}

module.exports = { authenticate };
