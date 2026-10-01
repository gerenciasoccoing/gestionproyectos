// Cálculo de un pago de nómina para un período (día de inicio -> día de pago), desglosado y
// auditable — mismo espíritu que severanceService.js#calculateSeverance, y reutiliza las mismas
// piezas (days360, LaborParameters vigentes, regla de auxilio de transporte) para que nómina,
// liquidación y el valor de contrato por rango (employeeController.js#previewContractValue) sean
// siempre consistentes entre sí.
const { Op } = require('sequelize');
const { EmployeeLeave } = require('../models');
const {
  days360, getEffectiveLaborParameters, computeAuxTransporte,
  computeOvertimeItems, overtimeWarning, computeDeductions,
  overlapDays360, cumulativeLeaveDaysBefore, incapacidadGeneralSplit, incapacidadLaboralSplit, simpleLeavePay,
} = require('./laborCalculations');

const LEAVE_DEVENGADO_LABELS = {
  vacaciones: 'Vacaciones',
  licencia_remunerada: 'Licencia remunerada',
};

// Procesa las novedades (incapacidades/vacaciones/licencias, ver EmployeeLeave.js) que se cruzan
// con el período: cuántos días NO se trabajaron (restan del salario ordinario y del auxilio, por
// construcción — ver sección 2 de la especificación) y qué se les paga en su lugar. La licencia NO
// remunerada resta días trabajados pero no genera ningún devengado (sección 4e).
async function processLeaves({ employeeId, periodStart, periodEnd, salaryValue, params }) {
  const leaves = await EmployeeLeave.findAll({
    where: {
      employeeId,
      startDate: { [Op.lte]: periodEnd },
      endDate: { [Op.gte]: periodStart },
    },
  });

  let notWorkedDays = 0;
  let leaveContributionToBase = 0; // incapacidades + vacaciones + licencias remuneradas (sección 5)
  const items = [];

  for (const leave of leaves) {
    const overlap = overlapDays360(leave.startDate, leave.endDate, periodStart, periodEnd);
    if (overlap <= 0) continue;
    notWorkedDays += overlap;

    if (leave.type === 'incapacidad_general' || leave.type === 'incapacidad_laboral') {
      // eslint-disable-next-line no-await-in-loop
      const cumulativeDaysBefore = await cumulativeLeaveDaysBefore(leave);
      const split = leave.type === 'incapacidad_general'
        ? incapacidadGeneralSplit({ leave, periodStart, periodEnd, salaryValue, params, cumulativeDaysBefore })
        : incapacidadLaboralSplit({ leave, periodStart, periodEnd, salaryValue, cumulativeDaysBefore });
      items.push(...split.items);
      leaveContributionToBase += split.total;
    } else if (leave.type === 'vacaciones' || leave.type === 'licencia_remunerada') {
      const pay = simpleLeavePay({ concepto: LEAVE_DEVENGADO_LABELS[leave.type], overlapDays: overlap, salaryValue });
      if (pay) {
        items.push(pay);
        leaveContributionToBase += pay.valor;
      }
    }
    // licencia_no_remunerada: ya restó notWorkedDays arriba, sin devengado — sección 4e.
  }

  return { notWorkedDays, items, leaveContributionToBase };
}

// overtimeHours: cantidades de horas extra/recargo del período (ver OVERTIME_TYPES en
// laborCalculations.js) — todas opcionales, un período sin horas extra calcula exactamente igual
// que antes de esta fase. `total` (y por tanto lo que termina pagándose/registrándose como gasto
// administrativo) es el NETO A PAGAR (devengado - deducciones de ley).
async function calculatePayroll({ employeeId, salaryValue, periodStart, periodEnd, overtimeHours }) {
  const params = await getEffectiveLaborParameters(periodEnd);
  const nominalDays = days360(periodStart, periodEnd);

  // Novedades (sección 2 y 4): días efectivamente trabajados = días del período - días de
  // incapacidad/vacaciones/licencia (de cualquier tipo). Sin employeeId (ej. el preview de
  // valor de contrato, que no tiene un trabajador real todavía) simplemente no hay novedades.
  const { notWorkedDays, items: leaveItems, leaveContributionToBase } = employeeId
    ? await processLeaves({ employeeId, periodStart, periodEnd, salaryValue, params })
    : { notWorkedDays: 0, items: [], leaveContributionToBase: 0 };

  const workedDays = Math.max(nominalDays - notWorkedDays, 0);
  const dailySalary = Number(salaryValue) / 30;
  const baseSalaryForPeriod = dailySalary * workedDays;

  // Auxilio de transporte: no se paga en días de incapacidad/vacaciones/licencia — por construcción,
  // ya que solo se calcula sobre workedDays (sección 2, último punto).
  const { applies: auxTransporteApplies, amount: auxTransporteMonthly } = computeAuxTransporte(salaryValue, params);
  const auxTransporteForPeriod = auxTransporteApplies ? (auxTransporteMonthly / 30) * workedDays : 0;

  const { items: overtimeItems, totalExtraHours, total: overtimeTotal } = computeOvertimeItems(overtimeHours, salaryValue, params);
  const warning = overtimeWarning(totalExtraHours, workedDays, params);

  const devengados = [
    {
      concepto: 'Salario del período',
      formula: '(salario mensual / 30) x días efectivamente trabajados',
      valores: { salarioMensual: Number(salaryValue), dias: workedDays },
      valor: baseSalaryForPeriod,
    },
    {
      concepto: 'Auxilio de transporte del período',
      formula: auxTransporteApplies ? '(auxilio de transporte mensual / 30) x días efectivamente trabajados' : 'No aplica (salario superior al tope)',
      valores: { auxTransporteMensual: auxTransporteMonthly, dias: workedDays },
      valor: auxTransporteForPeriod,
    },
    ...overtimeItems,
    ...leaveItems,
  ];
  const totalDevengado = baseSalaryForPeriod + auxTransporteForPeriod + overtimeTotal + leaveContributionToBase;

  // Base de cotización (sección 5): salario + horas extra + recargos + valor pagado por
  // incapacidades/vacaciones/licencias remuneradas — SIN auxilio de transporte (no es salario).
  const { items: deductionItems, total: totalDeducciones } = computeDeductions({
    baseAmount: baseSalaryForPeriod + overtimeTotal + leaveContributionToBase, salaryValue, daysWorked: workedDays, params,
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
    daysWorked: workedDays,
    nominalDays,
    notWorkedDays,
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
    daysWorked: workedDays,
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
