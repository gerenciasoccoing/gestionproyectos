// Cálculo de un pago de nómina para un período (día de inicio -> día de pago), desglosado y
// auditable — mismo espíritu que severanceService.js#calculateSeverance, y reutiliza las mismas
// piezas (days360, LaborParameters vigentes, regla de auxilio de transporte) para que nómina,
// liquidación y el valor de contrato por rango (employeeController.js#previewContractValue) sean
// siempre consistentes entre sí.
const {
  days360, getEffectiveLaborParameters, computeAuxTransporte,
  computeOvertimeItems, overtimeWarning, computeDeductions,
} = require('./laborCalculations');

// overtimeHours: cantidades de horas extra/recargo del período (ver OVERTIME_TYPES en
// laborCalculations.js) — todas opcionales, un período sin horas extra calcula exactamente igual
// que antes de esta fase. `total` (y por tanto lo que termina pagándose/registrándose como gasto
// administrativo) pasa a ser el NETO A PAGAR (devengado - deducciones de ley), no el devengado
// bruto como antes — ver la especificación de horas extra/recargos/deducciones.
async function calculatePayroll({ salaryValue, periodStart, periodEnd, overtimeHours }) {
  const params = await getEffectiveLaborParameters(periodEnd);
  const daysWorked = days360(periodStart, periodEnd);
  const dailySalary = Number(salaryValue) / 30;
  const baseSalaryForPeriod = dailySalary * daysWorked;

  const { applies: auxTransporteApplies, amount: auxTransporteMonthly } = computeAuxTransporte(salaryValue, params);
  const auxTransporteForPeriod = auxTransporteApplies ? (auxTransporteMonthly / 30) * daysWorked : 0;

  const { items: overtimeItems, totalExtraHours, total: overtimeTotal } = computeOvertimeItems(overtimeHours, salaryValue, params);
  const warning = overtimeWarning(totalExtraHours, daysWorked, params);

  const devengados = [
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
    ...overtimeItems,
  ];
  const totalDevengado = baseSalaryForPeriod + auxTransporteForPeriod + overtimeTotal;

  // Base de cotización: salario + horas extra + recargos del período, SIN auxilio de transporte
  // (no es salario). A partir de la Fase 3 (novedades), el valor pagado por incapacidades,
  // vacaciones y licencias remuneradas también se suma a esta base.
  const { items: deductionItems, total: totalDeducciones } = computeDeductions({
    baseAmount: baseSalaryForPeriod + overtimeTotal, salaryValue, daysWorked, params,
  });

  const total = totalDevengado - totalDeducciones; // neto a pagar

  const breakdown = {
    parametrosUsados: {
      laborParametersId: params.id,
      effectiveDate: params.effectiveDate,
      smlv: Number(params.smlv),
      auxTransporte: Number(params.auxTransporte),
      horasMensuales: Number(params.horasMensuales),
    },
    periodStart,
    periodEnd,
    daysWorked,
    dailySalary,
    auxilioTransporteAplica: auxTransporteApplies,
    overtimeWarning: warning,
    devengados,
    deducciones: deductionItems,
    totalDevengado,
    totalDeducciones,
    total,
  };

  return {
    laborParametersId: params.id,
    daysWorked,
    baseSalary: baseSalaryForPeriod,
    auxTransporte: auxTransporteForPeriod,
    overtimeHours: overtimeHours || null,
    grossEarnings: totalDevengado,
    totalDeductions: totalDeducciones,
    total,
    warning,
    breakdown,
  };
}

module.exports = { calculatePayroll };
