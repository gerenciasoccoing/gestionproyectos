// Antes, un trabajador solo podía estar en un proyecto (Employee.projectId), así que las rutas
// anidadas en /projects/:projectId/employees/:id/... podían exigir una igualdad simple. Desde que
// un trabajador puede tener varias EmployeeAssignment activas a la vez (ver EmployeeAssignment.js),
// "pertenece a este proyecto" ya no es solo esa igualdad: también cuenta si tiene una asignación
// ACTIVA a ese contrato, aunque su projectId principal sea otro (o null, administrativo). Un solo
// helper reutilizado por todos los sub-recursos del trabajador (novedades, deducciones,
// liquidación, nómina, contratos, la ficha misma) en vez de reimplementar el chequeo en cada uno.
async function employeeBelongsToProject(models, employeeId, employeeProjectId, projectId) {
  if (!projectId) return true;
  if (employeeProjectId === projectId) return true;
  const activeAssignment = await models.EmployeeAssignment.findOne({
    where: { employeeId, projectId, status: 'activo' },
  });
  return !!activeAssignment;
}

// Carga un trabajador por :id, respetando la ruta anidada (:projectId) con el criterio de arriba
// en vez de un simple where.projectId — usar en lugar de Employee.findOne({ where: scopeWhere(req) }).
async function loadScopedEmployee(models, req, findOptions = {}) {
  const employee = await models.Employee.findOne({ where: { id: req.params.id }, ...findOptions });
  if (!employee) return null;
  const allowed = await employeeBelongsToProject(models, employee.id, employee.projectId, req.params.projectId);
  if (!allowed) return null;
  return employee;
}

const ApiError = require('./ApiError');

// Middleware para las rutas GLOBALES de sub-recursos del trabajador (/employees/:id/..., ver
// globalEmployeeRoutes.js) — reemplaza a requireOptionalProjectAccess(byIdParam) ahí: ese helper
// genérico (authorize.js) solo compara UN resource.projectId contra los proyectos del usuario, y ya
// no alcanza, porque un trabajador puede ser accesible por una EmployeeAssignment activa a
// cualquiera de los proyectos del usuario aunque su projectId principal sea otro (o ninguno).
function requireEmployeeAccess(models) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, 'No autenticado'));
      const employee = await models.Employee.findByPk(req.params.id);
      if (!employee) return next(new ApiError(404, 'Recurso no encontrado'));
      if (req.user.isAdmin || !employee.projectId || req.user.projectIds.includes(employee.projectId)) {
        return next();
      }
      const activeAssignment = await models.EmployeeAssignment.findOne({
        where: { employeeId: employee.id, projectId: req.user.projectIds, status: 'activo' },
      });
      if (!activeAssignment) return next(new ApiError(403, 'No tiene acceso a este proyecto'));
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { employeeBelongsToProject, loadScopedEmployee, requireEmployeeAccess };
