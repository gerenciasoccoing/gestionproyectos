const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { sequelize, User, Role, Permission, Company, Project } = require('../models');
const { runInTransactionContext } = require('../utils/tenantContext');

// Verifica el JWT y adjunta a req.user: { id, name, email, isAdmin, permissions: Set('modulo:accion'), projectIds }.
// El companyId del token (puesto en el login, ver authController.signToken) ancla TODA la
// petición a esa empresa: se abre acá el contexto de aislamiento multi-tenant en sus dos capas —
// el companyId de JS (Capa 1, applyTenantScoping.js) y, desde acá también, una transacción con el
// GUC app.current_company_id seteado (Capa 2, Row-Level Security a nivel de PostgreSQL, ver
// postSyncFixups.js#applyRowLevelSecurity) — y se mantiene activo mientras dure la petición,
// porque next() se invoca desde adentro de ese contexto: todo lo que corra después (el resto de
// middlewares, el controlador, cualquier consulta a un modelo de negocio) lo hereda sin tener que
// pasarlo a mano.
//
// La transacción de la Capa 2 NO se maneja con el sequelize.transaction() de forma automática
// (eso haría commit apenas se resolviera la función que arma req.user, mucho antes de que la
// petición realmente termine, porque next() de Express no devuelve una promesa que espere el
// resto de la cadena) — se abre a mano y se confirma/revierte según el ciclo de vida real de la
// respuesta HTTP (eventos 'finish'/'close' de res), que sí reflejan cuándo la petición terminó.
async function authenticate(req, res, next) {
  let transaction = null;
  const settle = async (commit) => {
    if (!transaction || transaction.finished) return;
    try {
      await (commit ? transaction.commit() : transaction.rollback());
    } catch (err) {
      console.error('Error cerrando la transacción de la petición:', err);
    }
  };
  res.on('finish', () => settle(res.statusCode < 500));
  res.on('close', () => settle(false));

  try {
    transaction = await sequelize.transaction();

    const header = req.headers.authorization || '';
    // Además del header Authorization, se acepta ?token= en query string exclusivamente para
    // poder incrustar archivos protegidos (fotos, logo) en etiquetas <img>, que no admiten headers.
    const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token || null;
    if (!token) throw new ApiError(401, 'Token no proporcionado');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.companyId) throw new ApiError(401, 'Token inválido o expirado');

    await sequelize.query(
      "SELECT set_config('app.current_company_id', :companyId, true)",
      { transaction, replacements: { companyId: payload.companyId } }
    );

    await runInTransactionContext(payload.companyId, transaction, async () => {
      const company = await Company.findByPk(payload.companyId);
      if (!company || !company.active) throw new ApiError(403, 'Esta empresa no tiene acceso activo. Contacta al administrador de la plataforma.');

      const user = await User.findByPk(payload.sub, {
        include: [
          { model: Role, include: [Permission] },
          { model: Project, attributes: ['id'] },
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
    await settle(false);
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Token inválido o expirado'));
  }
}

module.exports = { authenticate };
