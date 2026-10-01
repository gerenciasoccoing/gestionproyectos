const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sequelize, Employee, Severance, Expense, AdminExpenseCategory } = require('../models');
const { calculateSeverance } = require('../services/severanceService');
const { relativePath, saveGeneratedFile } = require('../middleware/upload');
const { assertCashBoxUsable, overdraftWarning } = require('../services/cashBoxService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateLaborCalculationPdf } = require('../services/pdfService');
const { nextExpenseNumber, contractPrefixForProject } = require('../services/numberingService');
const { SEVERANCE_ELIGIBLE_TYPES } = require('../services/contractTemplates');

function pdfDocToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function scopeWhere(req) {
  const where = { id: req.params.id };
  if (req.params.projectId) where.projectId = req.params.projectId;
  return where;
}

// Liquidación de prestaciones sociales (cesantías, intereses, prima, vacaciones, indemnización) es
// exclusiva del contrato de trabajo — ni aprendizaje (Ley 789/2002, no genera estas prestaciones)
// ni prestación de servicios/subcontratación (civiles) tienen derecho a ella.
async function loadActiveEmployee(req) {
  const employee = await Employee.findOne({ where: scopeWhere(req) });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  if (employee.status === 'retirado') throw new ApiError(400, 'El empleado ya fue retirado');
  if (!SEVERANCE_ELIGIBLE_TYPES.includes(employee.contractType)) {
    throw new ApiError(400, 'Este trabajador no tiene un tipo de contrato que genere liquidación de prestaciones sociales.');
  }
  return employee;
}

// Previsualiza el cálculo desglosado de liquidación sin persistir nada.
const preview = asyncHandler(async (req, res) => {
  const employee = await loadActiveEmployee(req);
  const { exitDate, cause } = req.body;
  if (!exitDate || !cause) throw new ApiError(400, 'exitDate y cause son obligatorios');
  if (new Date(exitDate) < new Date(employee.entryDate)) {
    throw new ApiError(400, 'La fecha de retiro no puede ser anterior a la fecha de ingreso');
  }
  const result = await calculateSeverance({
    salaryValue: employee.salaryValue,
    entryDate: employee.entryDate,
    exitDate,
    cause,
  });
  res.json(result);
});

// Confirma el retiro: calcula, persiste la liquidación, genera el gasto y pasa el empleado a histórico.
const confirmRetirement = asyncHandler(async (req, res) => {
  const employee = await loadActiveEmployee(req);
  const { exitDate, cause, cashBoxId } = req.body;
  if (!exitDate || !cause) throw new ApiError(400, 'exitDate y cause son obligatorios');
  if (!cashBoxId) throw new ApiError(400, 'cashBoxId es obligatorio');
  if (new Date(exitDate) < new Date(employee.entryDate)) {
    throw new ApiError(400, 'La fecha de retiro no puede ser anterior a la fecha de ingreso');
  }

  const result = await calculateSeverance({
    salaryValue: employee.salaryValue,
    entryDate: employee.entryDate,
    exitDate,
    cause,
  });

  // Puente liquidación -> Gasto: de proyecto para personal de proyecto (comportamiento sin
  // cambios), administrativo (categoría "Personal administrativo de planta", sin proyecto, prefijo
  // ADM) para personal administrativo — ver la especificación del cliente para Gasto Administrativo
  // General. Se decide a partir de employee.projectId (el dato real del trabajador), nunca de
  // req.params.projectId (no existe cuando se confirma desde Personal del menú principal).
  const isAdministrative = !employee.projectId;
  const { severance, warning } = await sequelize.transaction(async (t) => {
    await assertCashBoxUsable(cashBoxId, { transaction: t });
    const expenseNumber = await nextExpenseNumber(t);
    let expense;
    if (isAdministrative) {
      const adminCategory = await AdminExpenseCategory.findOne({ where: { name: 'Personal administrativo de planta' }, transaction: t });
      if (!adminCategory) throw new ApiError(500, 'No se encontró la categoría "Personal administrativo de planta" en el catálogo de gastos administrativos.');
      expense = await Expense.create({
        expenseType: 'administrativo',
        projectId: null,
        cashBoxId,
        adminCategoryId: adminCategory.id,
        employeeId: employee.id,
        amount: result.total,
        date: exitDate,
        description: `Liquidación de prestaciones sociales - ${employee.name}`,
        source: 'liquidacion',
        createdBy: req.user.id,
        expenseNumber,
        contractPrefix: 'ADM',
      }, { transaction: t });
    } else {
      const contractPrefix = await contractPrefixForProject(employee.projectId, t);
      expense = await Expense.create({
        expenseType: 'proyecto',
        projectId: employee.projectId,
        cashBoxId,
        category: 'mano_obra',
        amount: result.total,
        date: exitDate,
        description: `Liquidación de prestaciones sociales - ${employee.name}`,
        source: 'liquidacion',
        createdBy: req.user.id,
        expenseNumber,
        contractPrefix,
      }, { transaction: t });
    }

    const created = await Severance.create({
      employeeId: employee.id,
      exitDate,
      cause,
      laborParametersId: result.laborParametersId,
      daysWorked: result.daysWorked,
      cesantias: result.cesantias,
      interesesCesantias: result.interesesCesantias,
      prima: result.prima,
      vacaciones: result.vacaciones,
      indemnizacion: result.indemnizacion,
      total: result.total,
      breakdown: result.breakdown,
      expenseId: expense.id,
    }, { transaction: t });

    expense.sourceId = created.id;
    await expense.save({ transaction: t });

    employee.exitDate = exitDate;
    employee.status = 'retirado';
    await employee.save({ transaction: t });

    const w = await overdraftWarning(cashBoxId, { transaction: t });
    return { severance: created, warning: w };
  });

  const company = await getLetterheadForProject(employee.projectId);
  const pdfBuffer = await pdfDocToBuffer(generateLaborCalculationPdf({
    title: 'Liquidación de prestaciones sociales',
    employee,
    company,
    breakdown: result.breakdown,
    meta: [
      { label: 'Fecha de retiro', value: exitDate },
      { label: 'Causal', value: cause },
      { label: 'Días trabajados', value: result.daysWorked },
    ],
  }));
  severance.pdfFilePath = saveGeneratedFile(severance.companyId, 'severance-reports', `liquidacion-${severance.id}.pdf`, pdfBuffer);
  await severance.save();

  res.status(201).json({ ...severance.toJSON(), warning });
});

const uploadPazYSalvo = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ where: scopeWhere(req) });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  const severance = await Severance.findOne({ where: { employeeId: employee.id } });
  if (!severance) throw new ApiError(400, 'El empleado aún no tiene liquidación registrada');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar el archivo de paz y salvo');

  severance.pazYSalvoFilePath = relativePath(req.file);
  await severance.save();
  res.json(severance);
});

module.exports = { preview, confirmRetirement, uploadPazYSalvo };
