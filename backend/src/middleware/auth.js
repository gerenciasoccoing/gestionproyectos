const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { sequelize, User, Role, Permission, Company, Project } = require('../models');
const { runInTransactionContext } = require('../utils/tenantContext');

// Caché corta en memoria de {empresa activa + usuario + roles + permisos + proyectos}, resuelto
// hoy con un Company.findByPk + User.findByPk (con Role→Permission y Project anidados) en CADA
// petición autenticada — el costo real detrás de la lentitud general de la app, no solo al
// navegar. TTL corto (no Redis: un solo contenedor backend, no hay estado que compartir entre
// instancias) para no volver obsoleto el permiso de nadie por mucho tiempo; además se invalida a
// mano (invalidateAuthCache) en cualquier punto que cambie roles/permisos/estado activo — ver
// userController.js, roleController.js, platformAdminController.js.
const AUTH_CACHE_TTL_MS = 45_000;
const authCache = new Map();

function getCachedAuthData(companyId, userId) {
  const entry = authCache.get(`${companyId}:${userId}`);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return null;
}

function setCachedAuthData(companyId, userId, data) {
  authCache.set(`${companyId}:${userId}`, { data, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

// Sin argumentos: limpia todo el caché. Son operaciones raras de administración (cambiar el rol
// de un usuario, los permisos de un rol, o activar/desactivar una empresa) — invalidar todo es
// más simple y seguro que rastrear con precisión a quién afecta cada cambio.
function invalidateAuthCache() {
  authCache.clear();
}

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
  let settled = false;
  // Si el socket se cierra ANTES de que la petición terminara normalmente (res.writableEnded aún
  // false), es el cliente quien abandonó la petición — navegó a otra pantalla, canceló el fetch —
  // no un resultado real de esta petición. Pasa seguido con navegación rápida entre pantallas
  // (varias peticiones en paralelo al montar una página, canceladas apenas se desmonta).
  let clientAborted = false;
  const settle = async (commit) => {
    if (settled || !transaction || transaction.finished) return;
    settled = true;
    try {
      await (commit ? transaction.commit() : transaction.rollback());
    } catch (err) {
      console.error('Error cerrando la transacción de la petición:', err);
    }
  };
  res.on('finish', () => settle(res.statusCode < 500));
  // A propósito NO se llama a settle() acá: la conexión de la petición hacia el cliente y la
  // conexión de esta transacción hacia Postgres son sockets completamente distintos — que el
  // cliente cierre la primera no interrumpe ni cancela la segunda. Si se revierte la transacción
  // aquí mientras una consulta (ej. User.findByPk, más abajo) sigue en pleno vuelo sobre esa MISMA
  // conexión, la revierte a medio camino: la consulta pendiente choca con "rollback has been called
  // on this transaction, you can no longer use it" y ESA conexión queda para siempre "idle in
  // transaction" en Postgres (el ROLLBACK nunca llega a enviarse) — confirmado en producción, una
  // fuga de conexiones real y silenciosa bajo el patrón normalísimo de navegar rápido entre
  // pantallas. Dejando que el trabajo en curso termine solo (a favor o en contra, sin que nadie del
  // otro lado esté ya escuchando la respuesta), settle() se termina llamando una sola vez, desde
  // 'finish' o desde el catch de abajo, nunca en carrera con una consulta que todavía no resolvió.
  res.on('close', () => {
    if (!res.writableEnded) clientAborted = true;
  });

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
      const cached = getCachedAuthData(payload.companyId, payload.sub);
      if (cached) {
        req.user = { ...cached, companyId: payload.companyId };
        return next();
      }

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

      const authData = {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin,
        permissions,
        roles: user.Roles.map((r) => r.name),
        projectIds: user.Projects.map((p) => p.id),
        // Módulos "plus" activados para la empresa (ver requireFeature) — de la empresa, no del
        // usuario: ni siquiera un admin de la empresa puede saltárselo.
        enabledFeatures: company.enabledFeatures || [],
      };
      setCachedAuthData(payload.companyId, payload.sub, authData);

      req.user = { ...authData, companyId: payload.companyId };
      return next();
    });
  } catch (err) {
    await settle(false);
    // El cliente ya se fue (ver el comentario junto a clientAborted arriba): no hay a quién
    // responder ni nada real que registrar, solo la consecuencia esperada de haber cortado la
    // transacción a medio camino.
    if (clientAborted) return;
    if (err instanceof ApiError) return next(err);
    // Solo un JWT inválido/vencido es realmente "401 sesión expirada" (el interceptor del
    // frontend borra el token y redirige a /login apenas ve un 401 — ver api/client.js). Cualquier
    // otro error (ej. no se pudo tomar una conexión del pool de la base de datos a tiempo) NO es un
    // problema de autenticación: antes se disfrazaba igual de 401 y el usuario quedaba deslogueado
    // sin ninguna pista real en los logs de qué pasó. Ahora se deja pasar tal cual al manejador de
    // errores global (responde 500 y sí lo registra), para no confundir una caída del servidor con
    // una sesión vencida.
    if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) {
      return next(new ApiError(401, 'Token inválido o expirado'));
    }
    console.error('Error inesperado en authenticate:', err);
    next(err);
  }
}

module.exports = { authenticate, invalidateAuthCache };
