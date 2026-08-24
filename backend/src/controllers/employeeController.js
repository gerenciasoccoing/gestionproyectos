const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, SocialSecurityDocument, PaymentReceipt, Severance, EmployeeContractDocument } = require('../models');
const { relativePath } = require('../middleware/upload');

const list = asyncHandler(async (req, res) => {
  const { status } = req.query; // ?status=retirado para ver histórico
  const where = { projectId: req.params.projectId };
  if (status) where.status = status;
  const employees = await Employee.findAll({
    where,
    include: [
      { model: SocialSecurityDocument, as: 'socialSecurityDocuments' },
      { model: PaymentReceipt, as: 'paymentReceipts' },
      { model: Severance, as: 'severance' },
    ],
    order: [['entryDate', 'DESC']],
  });
  res.json(employees);
});

const get = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({
    where: { id: req.params.id, projectId: req.params.projectId },
    include: [
      { model: SocialSecurityDocument, as: 'socialSecurityDocuments' },
      { model: PaymentReceipt, as: 'paymentReceipts' },
      { model: Severance, as: 'severance' },
    ],
  });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  res.json(employee);
});

// Campos opcionales, capturados para poder generar las minutas de contrato (ver
// contractTemplates.js) — ninguno es obligatorio para crear/editar un trabajador; solo se exigen
// al momento de generar un contrato según el tipo elegido (employeeContractController.js).
const OPTIONAL_FIELDS = [
  'documentNumber', 'address', 'city', 'phone', 'contractObject', 'contractEndDate',
  'epsName', 'pensionFundName', 'arlName', 'subcontractorLegalName', 'subcontractorNit', 'subcontractorLegalRep',
];
// ENUMs de Postgres: un '' del formulario no es un valor válido, hay que normalizarlo a null.
const ENUM_FIELDS = ['documentType', 'contractType'];

function applyOptionalFields(employee, body) {
  OPTIONAL_FIELDS.forEach((f) => { if (body[f] !== undefined) employee[f] = body[f] === '' ? null : body[f]; });
  ENUM_FIELDS.forEach((f) => { if (body[f] !== undefined) employee[f] = body[f] === '' ? null : body[f]; });
}

const create = asyncHandler(async (req, res) => {
  const { name, position, entryDate, dedicationHours, salaryValue } = req.body;
  if (!name || !position || !entryDate || salaryValue === undefined) {
    throw new ApiError(400, 'name, position, entryDate y salaryValue son obligatorios');
  }
  if (Number(salaryValue) < 0) throw new ApiError(400, 'El salario no puede ser negativo');

  const employee = Employee.build({
    projectId: req.params.projectId,
    name,
    position,
    entryDate,
    dedicationHours: dedicationHours === '' || dedicationHours === undefined ? null : dedicationHours,
    salaryValue,
    contractFilePath: relativePath(req.file),
  });
  applyOptionalFields(employee, req.body);
  await employee.save();
  res.status(201).json(employee);
});

const update = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  const { name, position, entryDate, dedicationHours, salaryValue } = req.body;
  if (name !== undefined) employee.name = name;
  if (position !== undefined) employee.position = position;
  if (entryDate !== undefined) employee.entryDate = entryDate;
  if (dedicationHours !== undefined) employee.dedicationHours = dedicationHours === '' ? null : dedicationHours;
  if (salaryValue !== undefined) {
    if (Number(salaryValue) < 0) throw new ApiError(400, 'El salario no puede ser negativo');
    employee.salaryValue = salaryValue;
  }
  applyOptionalFields(employee, req.body);
  if (req.file) employee.contractFilePath = relativePath(req.file);
  await employee.save();
  res.json(employee);
});

// El trabajador arrastra registros propios (afiliaciones, comprobantes de pago, contratos/
// otrosíes generados) que no tienen sentido sin él: se borran junto con la ficha, igual que
// APU.js borra sus APUComponent (ver onDelete:'CASCADE' ahí) — son datos de detalle, no
// movimientos de dinero reales por sí solos.
//
// La liquidación (Severance) es distinta: confirmarla ya generó un Expense real (con su propio
// movimiento de caja, ver severanceController#confirmRetirement) — igual que
// purchaseOrderController.remove bloquea si la orden ya se trasladó a un gasto, acá se bloquea la
// eliminación completa del trabajador en vez de borrar en cascada un rastro financiero real.
const remove = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');

  const severance = await Severance.findOne({ where: { employeeId: employee.id } });
  if (severance) {
    throw new ApiError(400, 'Este trabajador ya tiene una liquidación de prestaciones sociales registrada (con su gasto asociado) y no se puede eliminar.');
  }

  await SocialSecurityDocument.destroy({ where: { employeeId: employee.id } });
  await PaymentReceipt.destroy({ where: { employeeId: employee.id } });
  await EmployeeContractDocument.destroy({ where: { employeeId: employee.id } });
  await employee.destroy();
  res.status(204).send();
});

const uploadCedula = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar el archivo de la cédula');
  employee.cedulaFilePath = relativePath(req.file);
  await employee.save();
  res.json(employee);
});

const addSocialSecurityDocument = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  const { type, uploadDate } = req.body;
  if (!['salud', 'arl', 'pension'].includes(type)) throw new ApiError(400, 'type debe ser salud, arl o pension');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar el archivo de afiliación');

  const doc = await SocialSecurityDocument.create({
    employeeId: employee.id,
    type,
    uploadDate: uploadDate || new Date().toISOString().slice(0, 10),
    filePath: relativePath(req.file),
  });
  res.status(201).json(doc);
});

const addPaymentReceipt = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  const { date, periodLabel, amount } = req.body;
  if (!date || !periodLabel || amount === undefined) throw new ApiError(400, 'date, periodLabel y amount son obligatorios');
  if (Number(amount) < 0) throw new ApiError(400, 'El monto no puede ser negativo');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar el comprobante de pago');

  const receipt = await PaymentReceipt.create({
    employeeId: employee.id,
    date,
    periodLabel,
    amount,
    filePath: relativePath(req.file),
  });
  res.status(201).json(receipt);
});

module.exports = { list, get, create, update, remove, uploadCedula, addSocialSecurityDocument, addPaymentReceipt };
