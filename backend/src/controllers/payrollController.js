// Cálculo y registro de pago de nómina por período (día de inicio -> día de pago), con generación
// del PDF de soporte. Mismo espíritu que severanceController.js: preview() no persiste nada,
// confirm() persiste el PaymentReceipt ya calculado (a diferencia de addPaymentReceipt en
// employeeController.js, que sigue existiendo intacto para el flujo manual de "subir comprobante").
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sequelize, Employee, PaymentReceipt, Expense, AdminExpenseCategory } = require('../models');
const { calculatePayroll } = require('../services/payrollService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { saveGeneratedFile } = require('../middleware/upload');
const { generateLaborCalculationPdf } = require('../services/pdfService');
const { assertCashBoxUsable, overdraftWarning } = require('../services/cashBoxService');
const { nextExpenseNumber } = require('../services/numberingService');

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

async function loadEmployee(req) {
  const employee = await Employee.findOne({ where: scopeWhere(req) });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  return employee;
}

function validatePeriod(periodStart, periodEnd, paymentDate) {
  if (!periodStart || !periodEnd || !paymentDate) {
    throw new ApiError(400, 'periodStart, periodEnd y paymentDate son obligatorios');
  }
  if (new Date(periodEnd) < new Date(periodStart)) {
    throw new ApiError(400, 'periodEnd no puede ser anterior a periodStart');
  }
}

// Previsualiza el cálculo desglosado de un período de nómina sin persistir nada.
const preview = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const { periodStart, periodEnd, paymentDate } = req.body;
  validatePeriod(periodStart, periodEnd, paymentDate);

  const result = await calculatePayroll({
    salaryValue: employee.salaryValue,
    periodStart,
    periodEnd,
  });
  res.json(result);
});

// Calcula, persiste el comprobante de pago (PaymentReceipt) y genera su PDF de soporte. Para
// personal ADMINISTRATIVO (employee.projectId null) además genera automáticamente el Gasto
// administrativo correspondiente (categoría "Personal administrativo de planta"), igual criterio
// que la liquidación en severanceController.js#confirmRetirement — la nómina de personal DE
// PROYECTO sigue funcionando exactamente igual que antes (sin Gasto asociado, ver la
// especificación del cliente).
const confirm = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const { periodStart, periodEnd, paymentDate, cashBoxId } = req.body;
  validatePeriod(periodStart, periodEnd, paymentDate);

  const isAdministrative = !employee.projectId;
  if (isAdministrative && !cashBoxId) {
    throw new ApiError(400, 'cashBoxId es obligatorio para registrar la nómina de personal administrativo');
  }

  const result = await calculatePayroll({
    salaryValue: employee.salaryValue,
    periodStart,
    periodEnd,
  });

  let warning = null;
  const receipt = await sequelize.transaction(async (t) => {
    const created = await PaymentReceipt.create({
      employeeId: employee.id,
      date: paymentDate,
      periodLabel: `${periodStart} a ${periodEnd}`,
      amount: result.total,
      periodStart,
      periodEnd,
      daysWorked: result.daysWorked,
      baseSalary: result.baseSalary,
      auxTransporte: result.auxTransporte,
      breakdown: result.breakdown,
    }, { transaction: t });

    if (isAdministrative) {
      await assertCashBoxUsable(cashBoxId, { transaction: t });
      const adminCategory = await AdminExpenseCategory.findOne({ where: { name: 'Personal administrativo de planta' }, transaction: t });
      if (!adminCategory) throw new ApiError(500, 'No se encontró la categoría "Personal administrativo de planta" en el catálogo de gastos administrativos.');
      const expenseNumber = await nextExpenseNumber(t);
      const expense = await Expense.create({
        expenseType: 'administrativo',
        projectId: null,
        cashBoxId,
        adminCategoryId: adminCategory.id,
        employeeId: employee.id,
        amount: result.total,
        date: paymentDate,
        description: `Nómina ${periodStart} a ${periodEnd} - ${employee.name}`,
        source: 'nomina',
        sourceId: created.id,
        createdBy: req.user.id,
        expenseNumber,
        contractPrefix: 'ADM',
      }, { transaction: t });
      created.expenseId = expense.id;
      await created.save({ transaction: t });
      warning = await overdraftWarning(cashBoxId, { transaction: t });
    }

    return created;
  });

  const company = await getLetterheadForProject(employee.projectId);
  const pdfBuffer = await pdfDocToBuffer(generateLaborCalculationPdf({
    title: 'Comprobante de pago de nómina',
    employee,
    company,
    breakdown: result.breakdown,
    meta: [
      { label: 'Período', value: `${periodStart} a ${periodEnd}` },
      { label: 'Fecha de pago', value: paymentDate },
      { label: 'Días liquidados', value: result.daysWorked },
    ],
  }));
  receipt.pdfFilePath = saveGeneratedFile(receipt.companyId, 'payroll-receipts', `nomina-${receipt.id}.pdf`, pdfBuffer);
  await receipt.save();

  res.status(201).json({ ...receipt.toJSON(), warning });
});

module.exports = { preview, confirm };
