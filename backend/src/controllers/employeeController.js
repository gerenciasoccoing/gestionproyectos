const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, SocialSecurityDocument, PaymentReceipt, Severance, EmployeeContractDocument, Project } = require('../models');
const { relativePath } = require('../middleware/upload');
const { days360, getEffectiveLaborParameters, computeAuxTransporte } = require('../services/laborCalculations');

// Estos controladores atienden DOS montajes de ruta: el anidado en proyecto
// (/projects/:projectId/employees, ver employeeRoutes.js — comportamiento sin cambios) y el global
// (/employees, ver globalEmployeeRoutes.js), usado por Personal del menú principal, donde se ve
// TODO el personal de la empresa (administrativo + de proyecto) con filtros propios. Es la MISMA
// tabla/lógica de negocio en los dos casos (cero duplicación, ver la especificación del cliente):
// cuando la ruta trae :projectId se usa como filtro estricto (igual que antes); cuando no, se opera
// sobre toda la empresa. Mismo patrón ya usado en expenseController.js para Gastos.

function scopeWhere(req) {
  const where = { id: req.params.id };
  if (req.params.projectId) where.projectId = req.params.projectId;
  return where;
}

// Valor del contrato proporcional al rango de días (entryDate -> contractEndDate), con la MISMA
// convención de días (año comercial de 360, ver laborCalculations.js#days360) que ya usan
// liquidación y nómina — a propósito no es un valor que se guarda: siempre se puede recalcular a
// partir de salaryValue/entryDate/contractEndDate, así que mostrarlo en vivo en el formulario es
// suficiente y evita que quede desactualizado si esos campos cambian después.
const previewContractValue = asyncHandler(async (req, res) => {
  const { salaryValue, entryDate, contractEndDate } = req.body;
  if (salaryValue === undefined || !entryDate || !contractEndDate) {
    throw new ApiError(400, 'salaryValue, entryDate y contractEndDate son obligatorios');
  }
  if (new Date(contractEndDate) < new Date(entryDate)) {
    throw new ApiError(400, 'La fecha de terminación no puede ser anterior a la de inicio');
  }
  const days = days360(entryDate, contractEndDate);
  const dailySalary = Number(salaryValue) / 30;
  const total = dailySalary * days;

  const params = await getEffectiveLaborParameters(entryDate);
  const { applies: auxTransporteApplies, amount: auxTransporteMonthly } = computeAuxTransporte(salaryValue, params);
  const auxTransporteTotal = auxTransporteApplies ? (auxTransporteMonthly / 30) * days : 0;

  res.json({ days, dailySalary, total, auxTransporteApplies, auxTransporteMonthly, auxTransporteTotal, grandTotal: total + auxTransporteTotal });
});

const list = asyncHandler(async (req, res) => {
  const { status, vinculacion, contractType } = req.query; // ?status=retirado para ver histórico
  const where = {};
  if (req.params.projectId) {
    where.projectId = req.params.projectId;
  } else if (vinculacion === 'administrativo') {
    where.projectId = null;
  } else if (req.query.projectId) {
    // 'none' no aplica acá (ya lo cubre vinculacion=administrativo); un projectId real filtra a
    // ese proyecto específico dentro de la vista general.
    where.projectId = req.query.projectId;
  } else if (vinculacion === 'proyecto') {
    where.projectId = { [Op.ne]: null };
  }
  if (status) where.status = status;
  if (contractType) where.contractType = contractType;
  const employees = await Employee.findAll({
    where,
    include: [
      { model: SocialSecurityDocument, as: 'socialSecurityDocuments' },
      { model: PaymentReceipt, as: 'paymentReceipts' },
      { model: Severance, as: 'severance' },
      // Solo lo necesario para mostrar el estado de firma en la lista (ver PersonnelListPage.jsx):
      // el más reciente por sequenceNumber es "el documento vigente" de firma, mismo criterio que
      // ya usa la ficha del trabajador para el otrosí.
      { model: EmployeeContractDocument, as: 'contractDocuments', attributes: ['id', 'kind', 'sequenceNumber', 'signatureStatus'] },
      { model: Project, attributes: ['id', 'name'] },
    ],
    order: [['entryDate', 'DESC']],
  });
  res.json(employees);
});

const get = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({
    where: scopeWhere(req),
    include: [
      { model: SocialSecurityDocument, as: 'socialSecurityDocuments' },
      { model: PaymentReceipt, as: 'paymentReceipts' },
      { model: Severance, as: 'severance' },
      { model: Project, attributes: ['id', 'name'] },
    ],
  });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  res.json(employee);
});

// Campos opcionales, capturados para poder generar las minutas de contrato (ver
// contractTemplates.js) — ninguno es obligatorio para crear/editar un trabajador; solo se exigen
// al momento de generar un contrato según el tipo elegido (employeeContractController.js).
const OPTIONAL_FIELDS = [
  'documentNumber', 'address', 'city', 'phone', 'email', 'contractObject', 'contractEndDate', 'nationality',
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

  // Ruta anidada: siempre "de proyecto" (projectId viene de la URL, comportamiento sin cambios).
  // Ruta global: el body elige — administrativo (sin proyecto) o de proyecto (con projectId), ver
  // el selector "Vinculación" en PersonnelListPage.jsx.
  const projectId = req.params.projectId || req.body.projectId || null;
  if (projectId && !req.user.isAdmin && !req.user.projectIds.includes(projectId)) {
    throw new ApiError(403, 'No tiene acceso a este proyecto');
  }

  const employee = Employee.build({
    projectId,
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
  const employee = await Employee.findOne({ where: scopeWhere(req) });
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
  // La vinculación (administrativo/de proyecto) solo es editable desde la vista general: en la
  // ruta anidada el proyecto queda fijo por la URL, igual que en expenseController.js.
  if (!req.params.projectId && req.body.projectId !== undefined) {
    const newProjectId = req.body.projectId || null;
    if (newProjectId && !req.user.isAdmin && !req.user.projectIds.includes(newProjectId)) {
      throw new ApiError(403, 'No tiene acceso a este proyecto');
    }
    employee.projectId = newProjectId;
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
  const employee = await Employee.findOne({ where: scopeWhere(req) });
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
  const employee = await Employee.findOne({ where: scopeWhere(req) });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar el archivo de la cédula');
  employee.cedulaFilePath = relativePath(req.file);
  await employee.save();
  res.json(employee);
});

const addSocialSecurityDocument = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: scopeWhere(req) });
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
  const employee = await Employee.findOne({ where: scopeWhere(req) });
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

module.exports = { list, get, create, update, remove, uploadCedula, addSocialSecurityDocument, addPaymentReceipt, previewContractValue };
