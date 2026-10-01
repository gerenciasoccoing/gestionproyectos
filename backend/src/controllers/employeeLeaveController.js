// Novedades de nómina (incapacidades, vacaciones, licencias) — ver EmployeeLeave.js y
// laborCalculations.js para cómo afectan el cálculo de un período. Mismo patrón dual-ruta que el
// resto de Personal (employeeController.js): atiende tanto la ruta anidada de proyecto como la
// global del menú principal.
const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, EmployeeLeave, LeaveType } = require('../models');
const { relativePath } = require('../middleware/upload');
const { getVacationBalance } = require('../services/laborCalculations');

const LEAVE_TYPES = ['incapacidad_general', 'incapacidad_laboral', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada'];

function employeeScopeWhere(req) {
  const where = { id: req.params.id };
  if (req.params.projectId) where.projectId = req.params.projectId;
  return where;
}

async function loadEmployee(req) {
  const employee = await Employee.findOne({ where: employeeScopeWhere(req) });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  return employee;
}

const list = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const leaves = await EmployeeLeave.findAll({
    where: { employeeId: employee.id },
    include: [{ model: LeaveType }],
    order: [['startDate', 'DESC']],
  });
  res.json(leaves);
});

// supportFilePath es opcional a nivel de API (no todo trabajador trae el soporte físico en el
// mismo momento que registra la novedad) — el frontend lo marca como recomendado, no bloqueante.
const create = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const { type, startDate, endDate, leaveTypeId, parentLeaveId, notes } = req.body;
  if (!LEAVE_TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${LEAVE_TYPES.join(', ')}`);
  if (!startDate || !endDate) throw new ApiError(400, 'startDate y endDate son obligatorios');
  if (new Date(endDate) < new Date(startDate)) throw new ApiError(400, 'endDate no puede ser anterior a startDate');
  if (type === 'licencia_remunerada' && !leaveTypeId) throw new ApiError(400, 'leaveTypeId es obligatorio para una licencia remunerada');

  // Dos novedades que se crucen en fechas del mismo trabajador duplicarían el descuento de días
  // trabajados en la nómina — se rechaza antes de que eso pueda pasar.
  const overlapping = await EmployeeLeave.findOne({
    where: { employeeId: employee.id, startDate: { [Op.lte]: endDate }, endDate: { [Op.gte]: startDate } },
  });
  if (overlapping) throw new ApiError(400, 'Este trabajador ya tiene una novedad registrada que se cruza con estas fechas.');

  if (parentLeaveId) {
    const parent = await EmployeeLeave.findOne({ where: { id: parentLeaveId, employeeId: employee.id } });
    if (!parent) throw new ApiError(400, 'parentLeaveId no corresponde a una novedad de este trabajador.');
  }

  const leave = await EmployeeLeave.create({
    employeeId: employee.id,
    type,
    startDate,
    endDate,
    leaveTypeId: type === 'licencia_remunerada' ? leaveTypeId : null,
    parentLeaveId: parentLeaveId || null,
    supportFilePath: relativePath(req.file),
    notes: notes || null,
    createdBy: req.user.id,
  });
  res.status(201).json(leave);
});

// No se permite editar (los días ya pudieron haber entrado en una nómina confirmada, que guarda su
// propio snapshot del cálculo) — solo eliminar, y solo si no tiene una prórroga encadenada encima.
const remove = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const leave = await EmployeeLeave.findOne({ where: { id: req.params.leaveId, employeeId: employee.id } });
  if (!leave) throw new ApiError(404, 'Novedad no encontrada');
  const dependentCount = await EmployeeLeave.count({ where: { parentLeaveId: leave.id } });
  if (dependentCount > 0) throw new ApiError(400, 'Esta incapacidad tiene una prórroga registrada encima. Elimina primero la prórroga.');
  await leave.destroy();
  res.status(204).send();
});

const vacationBalance = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const balance = await getVacationBalance(employee);
  res.json(balance);
});

module.exports = { list, create, remove, vacationBalance };
