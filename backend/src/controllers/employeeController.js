const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, SocialSecurityDocument, PaymentReceipt, Severance } = require('../models');
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

const create = asyncHandler(async (req, res) => {
  const { name, position, entryDate, dedicationHours, salaryValue } = req.body;
  if (!name || !position || !entryDate || salaryValue === undefined) {
    throw new ApiError(400, 'name, position, entryDate y salaryValue son obligatorios');
  }
  if (Number(salaryValue) < 0) throw new ApiError(400, 'El salario no puede ser negativo');

  const employee = await Employee.create({
    projectId: req.params.projectId,
    name,
    position,
    entryDate,
    dedicationHours: dedicationHours === '' || dedicationHours === undefined ? null : dedicationHours,
    salaryValue,
    contractFilePath: relativePath(req.file),
  });
  res.status(201).json(employee);
});

const update = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  const { name, position, dedicationHours, salaryValue } = req.body;
  if (name !== undefined) employee.name = name;
  if (position !== undefined) employee.position = position;
  if (dedicationHours !== undefined) employee.dedicationHours = dedicationHours === '' ? null : dedicationHours;
  if (salaryValue !== undefined) {
    if (Number(salaryValue) < 0) throw new ApiError(400, 'El salario no puede ser negativo');
    employee.salaryValue = salaryValue;
  }
  if (req.file) employee.contractFilePath = relativePath(req.file);
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

module.exports = { list, get, create, update, addSocialSecurityDocument, addPaymentReceipt };
