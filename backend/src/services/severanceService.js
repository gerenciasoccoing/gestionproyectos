const { LaborParameters } = require('../models');

// Convención colombiana de "año comercial" (360 días, meses de 30 días) usada por ley
// para liquidar prestaciones sociales. días = (Δaños*360 + Δmeses*30 + Δdías) + 1 (inclusivo).
function days360(start, end) {
  const s = normalizeDay(start);
  const e = normalizeDay(end);
  const diff = (e.year - s.year) * 360 + (e.month - s.month) * 30 + (e.day - s.day);
  return Math.max(diff + 1, 0);
}

function normalizeDay(date) {
  const d = new Date(date);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: Math.min(d.getUTCDate(), 30),
  };
}

// Determina el inicio del semestre vigente a la fecha de retiro (para prima proporcional),
// sin retroceder antes de la fecha de ingreso.
function semesterStart(entryDate, exitDate) {
  const exit = new Date(exitDate);
  const year = exit.getUTCFullYear();
  const half1 = new Date(Date.UTC(year, 0, 1));
  const half2 = new Date(Date.UTC(year, 6, 1));
  const start = exit.getUTCMonth() < 6 ? half1 : half2;
  const entry = new Date(entryDate);
  return entry > start ? entry : start;
}

async function getEffectiveLaborParameters(atDate) {
  const params = await LaborParameters.findOne({
    where: {},
    order: [['effectiveDate', 'DESC']],
  });
  if (!params) throw new Error('No hay parámetros laborales configurados (LaborParameters)');
  return params;
}

// Reglas de indemnización simplificadas y parametrizables (CST Art. 64, contrato a término indefinido).
// indemnizacionRules (JSON en LaborParameters) puede sobreescribir: { baseDays, extraDaysPerYear, thresholdYears }
function calculateIndemnizacion(cause, daysWorked, dailySalary, rules) {
  if (cause !== 'sin_justa_causa') return { amount: 0, detail: 'No aplica indemnización para esta causal de retiro.' };

  const config = rules || { baseDays: 30, extraDaysPerYear: 20, thresholdYears: 1 };
  const yearsWorked = daysWorked / 360;
  let days;
  if (yearsWorked <= config.thresholdYears) {
    days = config.baseDays;
  } else {
    const extraYears = Math.ceil(yearsWorked - config.thresholdYears);
    days = config.baseDays + extraYears * config.extraDaysPerYear;
  }
  const amount = days * dailySalary;
  return {
    amount,
    detail: `Terminación sin justa causa: ${days} días de salario (base ${config.baseDays} + ${config.extraDaysPerYear}/año adicional tras ${config.thresholdYears} año(s)), sobre ${yearsWorked.toFixed(2)} años trabajados.`,
  };
}

// Calcula la liquidación de prestaciones sociales completamente desglosada (auditable),
// usando los LaborParameters vigentes a la fecha de retiro.
async function calculateSeverance({ salaryValue, entryDate, exitDate, cause }) {
  const params = await getEffectiveLaborParameters(exitDate);

  const auxTransporteApplies = Number(salaryValue) <= Number(params.smlv) * Number(params.topeAuxTransporteSalarios);
  const auxTransporte = auxTransporteApplies ? Number(params.auxTransporte) : 0;

  const baseCesantiasYPrima = Number(salaryValue) + auxTransporte; // aux. transporte SÍ integra la base de cesantías y prima
  const baseVacaciones = Number(salaryValue); // vacaciones se liquidan sobre salario básico, sin aux. transporte

  const totalDaysWorked = days360(entryDate, exitDate);

  // Cesantías = (salario + aux transporte) x días trabajados / 360
  const cesantias = (baseCesantiasYPrima * totalDaysWorked) / Number(params.cesantiasDivisor);

  // Intereses a la cesantía = Cesantías x días trabajados x %anual / 360 (interés simple sobre el saldo acumulado)
  const interesesCesantias = (cesantias * totalDaysWorked * (Number(params.interesesCesantiasPercent) / 100))
    / Number(params.cesantiasDivisor);

  // Prima de servicios proporcional al semestre en curso al momento del retiro
  const semStart = semesterStart(entryDate, exitDate);
  const daysInSemester = days360(semStart, exitDate);
  const prima = (baseCesantiasYPrima * daysInSemester) / Number(params.primaDivisor);

  // Vacaciones = salario básico x días trabajados / 720 (15 días hábiles de vacación por año completo)
  const vacaciones = (baseVacaciones * totalDaysWorked) / Number(params.vacacionesDivisor);

  const dailySalary = Number(salaryValue) / 30;
  const indemnizacionResult = calculateIndemnizacion(cause, totalDaysWorked, dailySalary, params.indemnizacionRules);

  const total = cesantias + interesesCesantias + prima + vacaciones + indemnizacionResult.amount;

  const breakdown = {
    parametrosUsados: {
      laborParametersId: params.id,
      effectiveDate: params.effectiveDate,
      smlv: Number(params.smlv),
      auxTransporte: Number(params.auxTransporte),
      cesantiasDivisor: Number(params.cesantiasDivisor),
      interesesCesantiasPercent: Number(params.interesesCesantiasPercent),
      primaDivisor: Number(params.primaDivisor),
      vacacionesDivisor: Number(params.vacacionesDivisor),
    },
    diasTrabajadosTotal: totalDaysWorked,
    auxilioTransporteAplica: auxTransporteApplies,
    baseCesantiasYPrima,
    baseVacaciones,
    conceptos: [
      {
        concepto: 'Cesantías',
        formula: '(salario + aux. transporte) x días trabajados / 360',
        valores: { base: baseCesantiasYPrima, dias: totalDaysWorked, divisor: Number(params.cesantiasDivisor) },
        valor: cesantias,
      },
      {
        concepto: 'Intereses a las cesantías',
        formula: 'Cesantías x días trabajados x (% anual) / 360',
        valores: { cesantias, dias: totalDaysWorked, porcentaje: Number(params.interesesCesantiasPercent) },
        valor: interesesCesantias,
      },
      {
        concepto: 'Prima de servicios proporcional',
        formula: '(salario + aux. transporte) x días del semestre / 360',
        valores: { base: baseCesantiasYPrima, diasSemestre: daysInSemester, semestreDesde: semStart },
        valor: prima,
      },
      {
        concepto: 'Vacaciones proporcionales',
        formula: 'salario básico x días trabajados / 720',
        valores: { base: baseVacaciones, dias: totalDaysWorked },
        valor: vacaciones,
      },
      {
        concepto: 'Indemnización',
        formula: indemnizacionResult.detail,
        valores: { dailySalary },
        valor: indemnizacionResult.amount,
      },
    ],
    total,
  };

  return {
    laborParametersId: params.id,
    daysWorked: totalDaysWorked,
    cesantias,
    interesesCesantias,
    prima,
    vacaciones,
    indemnizacion: indemnizacionResult.amount,
    total,
    breakdown,
  };
}

module.exports = { calculateSeverance, days360, semesterStart };
