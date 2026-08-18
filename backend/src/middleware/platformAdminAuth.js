const ApiError = require('../utils/ApiError');

// Gate interino para operaciones de plataforma (alta de empresas) mientras no existe un panel de
// super-admin con sesión propia (Entrega 3): exige una clave compartida por variable de entorno en
// vez de un JWT de usuario, ya que estas operaciones no pertenecen a ninguna empresa todavía.
function requirePlatformSecret(req, res, next) {
  const secret = process.env.PLATFORM_ADMIN_SECRET;
  if (!secret) {
    return next(new ApiError(503, 'Alta de empresas no configurada en este servidor'));
  }
  if (req.header('X-Platform-Admin-Secret') !== secret) {
    return next(new ApiError(401, 'No autorizado'));
  }
  next();
}

module.exports = { requirePlatformSecret };
