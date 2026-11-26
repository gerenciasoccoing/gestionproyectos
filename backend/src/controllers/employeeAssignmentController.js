// CRUD de asignaciones trabajador↔contrato (ver EmployeeAssignment.js y la especificación: "Crea
// una relación muchos a muchos trabajador ↔ contrato/proyecto"). Atiende tanto la ruta anidada de
// proyecto como la global, mismo patrón que el resto de Personal (ver employeeController.js) — acá
// además la ruta anidada se usa para FIJAR projectId al asignar desde dentro de un proyecto
// (comportamiento análogo a employeeController.create()).
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, EmployeeAssignment, Project } = require('../models');
const { loadScopedEmployee } = require('../utils/employeeProjectAccess');

async function loadEmployee(req) {
  const employee = await loadScopedEmployee({ Employee, EmployeeAssignment }, req);
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  return employee;
}

function assertProjectAccess(req, projectId) {
  if (!req.user.isAdmin && !req.user.projectIds.includes(projectId)) {
    throw new ApiError(403, 'No tiene acceso a este proyecto');
  }
}

const list = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const assignments = await EmployeeAssignment.findAll({
    where: { employeeId: employee.id },
    include: [{ model: Project, attributes: ['id', 'name', 'contractNumber'] }],
    order: [['startDate', 'DESC']],
  });
  res.json(assignments);
});

// Asignar a un NUEVO contrato — no toca Employee.projectId (la asignación "principal" solo cambia
// vía el selector de vinculación en employeeController.update(), ver ese comentario): un trabajador
// administrativo asignado acá sigue administrativo, y uno de proyecto puede sumar más contratos sin
// que el principal cambie (ver la especificación: "sin perder esa condición").
const create = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const projectId = req.params.projectId || req.body.projectId;
  if (!projectId) throw new ApiError(400, 'projectId es obligatorio');
  const { startDate, position, observations } = req.body;
  if (!startDate) throw new ApiError(400, 'startDate es obligatoria');
  assertProjectAccess(req, projectId);

  const project = await Project.findByPk(projectId);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');

  // No hay constraint de base de datos para esto (ver el comentario en EmployeeAssignment.js):
  // un trabajador puede volver a asignarse al mismo contrato más adelante, pero no dos veces A LA
  // VEZ — eso sí se bloquea acá.
  const existingActive = await EmployeeAssignment.findOne({
    where: { employeeId: employee.id, projectId, status: 'activo' },
  });
  if (existingActive) throw new ApiError(409, 'Este trabajador ya tiene una asignación activa a este contrato.');

  const assignment = await EmployeeAssignment.create({
    employeeId: employee.id,
    projectId,
    startDate,
    position: position || employee.position,
    observations: observations || null,
    status: 'activo',
  });
  res.status(201).json(assignment);
});

const update = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const assignment = await EmployeeAssignment.findOne({ where: { id: req.params.assignmentId, employeeId: employee.id } });
  if (!assignment) throw new ApiError(404, 'Asignación no encontrada');
  // Lo que identifica la asignación (trabajador/contrato/fecha de inicio) no se edita: para
  // corregirlo hay que finalizarla y crear una nueva — solo el cargo en ese contrato y las
  // observaciones son datos de detalle editables sin romper el historial.
  const { position, observations } = req.body;
  if (position !== undefined) assignment.position = position;
  if (observations !== undefined) assignment.observations = observations;
  await assignment.save();
  res.json(assignment);
});

// Finalizar (no eliminar): cierra la asignación con fecha de fin, conservando el historial — igual
// criterio que employeeLeaveController.remove() usa para no romper rastros ya usados en cálculos.
const finalize = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const assignment = await EmployeeAssignment.findOne({ where: { id: req.params.assignmentId, employeeId: employee.id } });
  if (!assignment) throw new ApiError(404, 'Asignación no encontrada');
  if (assignment.status !== 'activo') throw new ApiError(400, 'Esta asignación ya está finalizada');
  const endDate = req.body.endDate || new Date().toISOString().slice(0, 10);
  if (new Date(endDate) < new Date(assignment.startDate)) {
    throw new ApiError(400, 'La fecha de fin no puede ser anterior a la fecha de inicio de la asignación');
  }
  assignment.status = 'finalizado';
  assignment.endDate = endDate;
  await assignment.save();
  res.json(assignment);
});

// Solo para corregir un error de captura (asignación creada por equivocación) — si ya tiene fecha
// de fin o está finalizada, mejor dejar el rastro y no eliminar: por eso no se exige, pero sí se
// permite siempre, a diferencia de employeeLeaveController.remove() (que bloquea según dependencias
// de nómina); una asignación no afecta por sí sola ningún cálculo financiero.
const remove = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const assignment = await EmployeeAssignment.findOne({ where: { id: req.params.assignmentId, employeeId: employee.id } });
  if (!assignment) throw new ApiError(404, 'Asignación no encontrada');
  await assignment.destroy();
  res.status(204).send();
});

module.exports = { list, create, update, finalize, remove };
