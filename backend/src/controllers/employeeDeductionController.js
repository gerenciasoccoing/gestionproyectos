// Otros descuentos de nómina (préstamos/anticipos, libranzas, embargos judiciales, otros
// descuentos autorizados) de un trabajador — ver laborCalculations.js#computeOtherDeductions para
// cómo se aplican sobre un período, y payrollController.js#confirm para cómo se decrementa el
// saldo. Mismo patrón dual-ruta que el resto de Personal: atiende tanto la ruta anidada de
// proyecto como la global del menú principal.
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, EmployeeDeduction } = require('../models');
const { relativePath } = require('../middleware/upload');

const DEDUCTION_TYPES = ['prestamo', 'libranza', 'embargo', 'otro'];
// Préstamo/libranza/otro son autorizados por el trabajador (requieren su autorización escrita
// adjunta); el embargo es una orden judicial, no algo que el trabajador autorice — el adjunto ahí
// es recomendado (la orden misma) pero no se bloquea la creación si todavía no se tiene a mano.
const REQUIRES_AUTHORIZATION_FILE = new Set(['prestamo', 'libranza', 'otro']);

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
  const deductions = await EmployeeDeduction.findAll({ where: { employeeId: employee.id }, order: [['createdAt', 'DESC']] });
  res.json(deductions);
});

const create = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const { type, concept, embargoKind, totalAmount, installmentAmount, startDate, notes } = req.body;
  if (!DEDUCTION_TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${DEDUCTION_TYPES.join(', ')}`);
  if (!concept || !concept.trim()) throw new ApiError(400, 'concept es obligatorio');
  if (installmentAmount === undefined || installmentAmount === '' || Number(installmentAmount) <= 0) {
    throw new ApiError(400, 'installmentAmount es obligatorio y debe ser mayor a 0');
  }
  if (type === 'embargo' && !['ordinario', 'alimentos'].includes(embargoKind)) {
    throw new ApiError(400, 'embargoKind debe ser ordinario o alimentos para un embargo judicial');
  }
  if (REQUIRES_AUTHORIZATION_FILE.has(type) && !req.file) {
    throw new ApiError(400, 'Este tipo de descuento requiere adjuntar la autorización escrita del trabajador');
  }

  const deduction = await EmployeeDeduction.create({
    employeeId: employee.id,
    type,
    concept: concept.trim(),
    embargoKind: type === 'embargo' ? embargoKind : null,
    totalAmount: totalAmount === '' || totalAmount === undefined ? null : Number(totalAmount),
    installmentAmount: Number(installmentAmount),
    balance: totalAmount === '' || totalAmount === undefined ? null : Number(totalAmount),
    authorizationFilePath: relativePath(req.file),
    startDate: startDate || null,
    notes: notes || null,
    createdBy: req.user.id,
  });
  res.status(201).json(deduction);
});

// No se permite editar montos/tipo (si ya se aplicó alguna cuota, el saldo ya refleja eso — editar
// el total retroactivamente lo dejaría inconsistente); solo activar/desactivar y eliminar.
const setStatus = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const deduction = await EmployeeDeduction.findOne({ where: { id: req.params.deductionId, employeeId: employee.id } });
  if (!deduction) throw new ApiError(404, 'Descuento no encontrado');
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active debe ser true o false');
  deduction.active = active;
  await deduction.save();
  res.json(deduction);
});

// Solo se puede eliminar si todavía no se ha aplicado ninguna cuota (balance === totalAmount, o
// totalAmount nunca se informó) — si ya se descontó algo, se desactiva en su lugar para no perder
// el rastro de lo ya aplicado.
const remove = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const deduction = await EmployeeDeduction.findOne({ where: { id: req.params.deductionId, employeeId: employee.id } });
  if (!deduction) throw new ApiError(404, 'Descuento no encontrado');
  if (deduction.totalAmount != null && Number(deduction.balance) !== Number(deduction.totalAmount)) {
    throw new ApiError(400, 'Ya se aplicó al menos una cuota de este descuento — desactívalo en vez de eliminarlo.');
  }
  await deduction.destroy();
  res.status(204).send();
});

module.exports = { list, create, setStatus, remove };
