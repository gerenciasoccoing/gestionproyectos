// Cálculo y registro de pago de nómina por período (día de inicio -> día de pago), con generación
// del PDF de soporte. Mismo espíritu que severanceController.js: preview() no persiste nada,
// confirm() persiste el PaymentReceipt ya calculado (a diferencia de addPaymentReceipt en
// employeeController.js, que sigue existiendo intacto para el flujo manual de "subir comprobante").
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, PaymentReceipt } = require('../models');
const { calculatePayroll } = require('../services/payrollService');
const { getSettingsForPdf } = require('./companySettingsController');
const { saveGeneratedFile } = require('../middleware/upload');
const { generateLaborCalculationPdf } = require('../services/pdfService');

function pdfDocToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function loadEmployee(req) {
  const employee = await Employee.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
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

// Calcula, persiste el comprobante de pago (PaymentReceipt) y genera su PDF de soporte.
const confirm = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const { periodStart, periodEnd, paymentDate } = req.body;
  validatePeriod(periodStart, periodEnd, paymentDate);

  const result = await calculatePayroll({
    salaryValue: employee.salaryValue,
    periodStart,
    periodEnd,
  });

  const receipt = await PaymentReceipt.create({
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
  });

  const company = await getSettingsForPdf();
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

  res.status(201).json(receipt);
});

module.exports = { preview, confirm };
