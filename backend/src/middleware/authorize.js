const ApiError = require('../utils/ApiError');

// Verifica que el usuario tenga el permiso "modulo:accion" (unión de permisos de todos sus roles).
function requirePermission(moduleName, action) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'No autenticado'));
    if (req.user.isAdmin) return next();
    if (req.user.permissions.has(`${moduleName}:${action}`)) return next();
    return next(new ApiError(403, `No tiene permiso para ${action} en ${moduleName}`));
  };
}

// Verifica que el usuario esté asignado al proyecto referenciado (o sea admin).
// extractProjectId(req) debe devolver el projectId a validar; por defecto usa req.params.projectId.
function requireProjectAccess(extractProjectId = (req) => req.params.projectId) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, 'No autenticado'));
      if (req.user.isAdmin) return next();
      const projectId = await extractProjectId(req);
      if (!projectId) return next(new ApiError(400, 'No se pudo determinar el proyecto'));
      if (!req.user.projectIds.includes(projectId)) {
        return next(new ApiError(403, 'No tiene acceso a este proyecto'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Variante de requireProjectAccess para recursos con proyecto OPCIONAL identificados por :id en
// la URL (ej. una orden de compra creada desde la ficha de un proveedor, sin proyecto asignado
// todavía). Si el recurso no tiene proyecto, solo aplica el permiso de módulo (ya validado antes
// por requirePermission); si lo tiene, exige que el usuario esté asignado a ese proyecto, igual
// que requireProjectAccess. getResource(req) debe devolver el recurso (o null si no existe).
function requireOptionalProjectAccess(getResource) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, 'No autenticado'));
      const resource = await getResource(req);
      if (!resource) return next(new ApiError(404, 'Recurso no encontrado'));
      if (req.user.isAdmin || !resource.projectId) return next();
      if (!req.user.projectIds.includes(resource.projectId)) {
        return next(new ApiError(403, 'No tiene acceso a este proyecto'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Verifica que la EMPRESA (no el usuario) tenga activado un módulo "plus" (ver
// Company.enabledFeatures / platformAdminController.updateCompanyFeatures). A diferencia de
// requirePermission, esto no lo puede saltar un admin de la empresa: es un interruptor de
// producto que solo controla el super-administrador de la plataforma. Se aplica en TODAS las
// rutas del módulo (no solo en el frontend) para que una empresa sin el flag no pueda acceder ni
// siquiera por URL directa.
function requireFeature(featureKey) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'No autenticado'));
    if (!req.user.enabledFeatures?.includes(featureKey)) {
      return next(new ApiError(403, 'Este módulo no está activado para tu empresa. Contacta a tu administrador.'));
    }
    return next();
  };
}

module.exports = { requirePermission, requireProjectAccess, requireOptionalProjectAccess, requireFeature };
