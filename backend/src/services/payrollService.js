// Cálculo de un pago de nómina para un período (día de inicio -> día de pago), desglosado y
// auditable — mismo espíritu que severanceService.js#calculateSeverance, y reutiliza las mismas
// piezas (days360, LaborParameters vigentes, regla de auxilio de transporte) para que nómina,
// liquidación y el valor de contrato por rango (employeeController.js#previewContractValue) sean
// siempre consistentes entre sí.
const { days360, getEffectiveLaborParameters, computeAuxTransporte } = require('./laborCalculations');

async function calculatePayroll({ salaryValue, periodStart, periodEnd }) {
  const params = await getEffectiveLaborParameters(periodEnd);
  const daysWorked = days360(periodStart, periodEnd);
  const dailySalary = Number(salaryValue) / 30;
  const baseSalaryForPeriod = dailySalary * daysWorked;

  const { applies: auxTransporteApplies, amount: auxTransporteMonthly } = computeAuxTransporte(salaryValue, params);
  const auxTransporteForPeriod = auxTransporteApplies ? (auxTransporteMonthly / 30) * daysWorked : 0;

  const total = baseSalaryForPeriod + auxTransporteForPeriod;

  const breakdown = {
    parametrosUsados: {
      laborParametersId: params.id,
      effectiveDate: params.effectiveDate,
      smlv: Number(params.smlv),
      auxTransporte: Number(params.auxTransporte),
    },
    periodStart,
    periodEnd,
    daysWorked,
    dailySalary,
    auxilioTransporteAplica: auxTransporteApplies,
    conceptos: [
      {
        concepto: 'Salario del período',
        formula: '(salario mensual / 30) x días del período',
        valores: { salarioMensual: Number(salaryValue), dias: daysWorked },
        valor: baseSalaryForPeriod,
      },
      {
        concepto: 'Auxilio de transporte del período',
        formula: auxTransporteApplies ? '(auxilio de transporte mensual / 30) x días del período' : 'No aplica (salario superior al tope)',
        valores: { auxTransporteMensual: auxTransporteMonthly, dias: daysWorked },
        valor: auxTransporteForPeriod,
      },
    ],
    total,
  };

  return {
    laborParametersId: params.id,
    daysWorked,
    baseSalary: baseSalaryForPeriod,
    auxTransporte: auxTransporteForPeriod,
    total,
    breakdown,
  };
}

module.exports = { calculatePayroll };
