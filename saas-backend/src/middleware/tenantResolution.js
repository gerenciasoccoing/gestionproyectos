const ApiError = require('../utils/ApiError');
const { Tenant } = require('../models');

// Middleware único de resolución de tenant: se ejecuta antes de cualquier ruta de tienda/checkout
// e inyecta el tenant activo en req.tenant. Ningún query de negocio debe correr sin haber pasado
// por aquí primero.
//
// Orden de resolución:
//  1. Dominio propio del tenant (CNAME), ej. tienda.empresa.com -> Tenant.customDomain.
//  2. Subdominio de la plataforma, ej. empresa.BASE_DOMAIN -> Tenant.subdomain.
//  3. (Solo fuera de producción) Header X-Tenant-Subdomain o ?tenant=slug, para poder probar
//     multi-tenant en local sin DNS real.
function extractSubdomain(hostname) {
  const baseDomain = (process.env.BASE_DOMAIN || '').toLowerCase();
  if (!baseDomain) return null;
  const host = hostname.toLowerCase();
  if (host === baseDomain || !host.endsWith(`.${baseDomain}`)) return null;
  const prefix = host.slice(0, -(`.${baseDomain}`.length));
  if (!prefix || prefix.includes('.') || ['www', 'api'].includes(prefix)) return null;
  return prefix;
}

async function resolveTenant(req, res, next) {
  try {
    const hostname = (req.hostname || req.headers.host || '').split(':')[0];

    let tenant = await Tenant.findOne({ where: { customDomain: hostname } });

    if (!tenant) {
      const subdomain = extractSubdomain(hostname);
      if (subdomain) tenant = await Tenant.findOne({ where: { subdomain } });
    }

    if (!tenant && process.env.NODE_ENV !== 'production') {
      const devSlug = req.headers['x-tenant-subdomain'] || req.query.tenant;
      if (devSlug) tenant = await Tenant.findOne({ where: { subdomain: String(devSlug) } });
    }

    if (!tenant) throw new ApiError(404, 'Tienda no encontrada para este dominio');
    if (tenant.status !== 'active') throw new ApiError(403, 'Esta tienda no está disponible actualmente');

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveTenant };
