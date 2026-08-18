const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { PlatformAdmin } = require('../models');

// Verifica el JWT de operador de plataforma y adjunta a req.platformAdmin. Deliberadamente
// independiente del middleware de usuarios (ver middleware/auth.js): un token de operador no
// lleva companyId (así que authenticate() nunca lo confunde con un usuario), y este middleware
// exige claim("type") === "platform_admin" (así que un token de usuario normal, aunque alguien
// intentara reusarlo aquí, nunca pasa). No abre contexto multi-tenant (runWithCompany): las
// operaciones de este panel son sobre TODAS las empresas, no dentro de una sola.
async function authenticatePlatformAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Token no proporcionado');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'platform_admin') throw new ApiError(401, 'Token inválido o expirado');

    const admin = await PlatformAdmin.findByPk(payload.sub);
    if (!admin || !admin.active) throw new ApiError(401, 'Cuenta de operador inválida o inactiva');

    req.platformAdmin = { id: admin.id, name: admin.name, email: admin.email };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Token inválido o expirado'));
  }
}

module.exports = { authenticatePlatformAdmin };
