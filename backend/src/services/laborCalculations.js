// Piezas de cálculo laboral compartidas entre liquidación (severanceService.js), nómina
// (payrollService.js) y el valor de contrato por rango de días (employeeController.js) — una sola
// fuente de verdad para que los tres usen exactamente la misma convención de días y de auxilio de
// transporte, en vez de fórmulas ligeramente distintas mantenidas por separado en cada lugar.
const { Op } = require('sequelize');
const { LaborParameters } = require('../models');

// Convención colombiana de "año comercial" (360 días, meses de 30 días) usada por ley para
// liquidar prestaciones sociales, y reutilizada acá para cualquier cálculo proporcional por días
// (nómina, valor de contrato). días = (Δaños*360 + Δmeses*30 + Δdías) + 1 (inclusivo).
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

// Los LaborParameters están versionados por effectiveDate (el SMLV y demás cambian cada año) —
// esto busca la versión vigente A LA FECHA PEDIDA (la más reciente cuya effectiveDate no sea
// posterior a atDate), no simplemente "la más reciente que exista". Antes de este cambio la
// función recibía atDate pero nunca lo usaba, así que una liquidación o nómina calculada con
// fecha pasada habría tomado silenciosamente los parámetros más nuevos (ej. el SMLV del año
// siguiente) en cuanto existiera más de una versión — bug real, sin efecto visible todavía porque
// hasta ahora solo existe una fila por empresa.
async function getEffectiveLaborParameters(atDate) {
  const params = await LaborParameters.findOne({
    where: atDate ? { effectiveDate: { [Op.lte]: atDate } } : {},
    order: [['effectiveDate', 'DESC']],
  });
  if (!params) throw new Error('No hay parámetros laborales configurados (LaborParameters)');
  return params;
}

// Regla del auxilio de transporte: solo aplica a salarios <= topeAuxTransporteSalarios x SMLV.
function computeAuxTransporte(salaryValue, params) {
  const applies = Number(salaryValue) <= Number(params.smlv) * Number(params.topeAuxTransporteSalarios);
  return { applies, amount: applies ? Number(params.auxTransporte) : 0 };
}

// isExtra=true: hora EXTRA (fuera de jornada) — se paga la hora completa más el recargo, 100% +
// este %. isExtra=false: RECARGO sobre una hora ORDINARIA (dentro de jornada, solo cambia el
// horario/día) — la hora ya está pagada en el salario básico, acá solo se paga el % adicional.
const OVERTIME_TYPES = {
  horaExtraDiurna: { field: 'horaExtraDiurnaPercent', isExtra: true, label: 'Hora extra diurna' },
  horaExtraNocturna: { field: 'horaExtraNocturnaPercent', isExtra: true, label: 'Hora extra nocturna' },
  recargoNocturno: { field: 'recargoNocturnoPercent', isExtra: false, label: 'Recargo nocturno' },
  recargoDominical: { field: 'recargoDominicalPercent', isExtra: false, label: 'Recargo dominical o festivo' },
  recargoNocturnoDominical: { field: 'recargoNocturnoDominicalPercent', isExtra: false, label: 'Recargo nocturno en dominical o festivo' },
  horaExtraDiurnaDominical: { field: 'horaExtraDiurnaDominicalPercent', isExtra: true, label: 'Hora extra diurna en dominical o festivo' },
  horaExtraNocturnaDominical: { field: 'horaExtraNocturnaDominicalPercent', isExtra: true, label: 'Hora extra nocturna en dominical o festivo' },
};

// Valor de la hora ordinaria: salario mensual / horas mensuales de la jornada vigente (210 = 42
// horas/semana por defecto, ver LaborParameters.horasMensuales).
function hourlyRate(salaryValue, params) {
  return Number(salaryValue) / Number(params.horasMensuales);
}

// overtimeHours: { horaExtraDiurna, horaExtraNocturna, recargoNocturno, recargoDominical,
// recargoNocturnoDominical, horaExtraDiurnaDominical, horaExtraNocturnaDominical } (cantidades de
// horas del período, todas opcionales/0 por defecto). totalExtraHours solo suma las horas EXTRA
// (isExtra:true) — los recargos no son "horas extra" para efecto del tope legal de 2/12 horas.
function computeOvertimeItems(overtimeHours, salaryValue, params) {
  const rate = hourlyRate(salaryValue, params);
  const items = [];
  let totalExtraHours = 0;
  for (const [key, { field, isExtra, label }] of Object.entries(OVERTIME_TYPES)) {
    const hours = Number(overtimeHours?.[key]) || 0;
    if (hours <= 0) continue;
    const percent = Number(params[field]);
    const unitValue = isExtra ? rate * (1 + percent / 100) : rate * (percent / 100);
    const value = unitValue * hours;
    if (isExtra) totalExtraHours += hours;
    items.push({
      concepto: label,
      formula: isExtra
        ? `valor hora ordinaria x (100% + ${percent}%) x horas`
        : `valor hora ordinaria x ${percent}% x horas (recargo, la hora ya está pagada en el salario)`,
      valores: { horas: hours, valorHoraOrdinaria: rate, porcentaje: percent, valorHora: unitValue },
      valor: value,
    });
  }
  return { items, totalExtraHours, total: items.reduce((s, i) => s + i.valor, 0) };
}

// Advertencia (no bloquea el cálculo) si las horas EXTRA registradas superan el tope legal
// proyectado para los días del período — con días sueltos, no un registro día a día, el tope se
// proyecta proporcional (topeDiarias x días trabajados, topeSemanales x semanas del período).
function overtimeWarning(totalExtraHours, daysWorked, params) {
  if (totalExtraHours <= 0) return null;
  const topeDiarias = Number(params.topeHorasExtraDiarias) * daysWorked;
  const topeSemanales = Number(params.topeHorasExtraSemanales) * (daysWorked / 7);
  const tope = Math.min(topeDiarias, topeSemanales);
  if (totalExtraHours > tope) {
    return `Las horas extra del período (${totalExtraHours}) superan el tope legal proyectado para ${daysWorked} días (máx. ${Number(params.topeHorasExtraDiarias)} diarias / ${Number(params.topeHorasExtraSemanales)} semanales ≈ ${tope.toFixed(1)} horas). Revisa el registro antes de confirmar.`;
  }
  return null;
}

// % de Fondo de Solidaridad Pensional según el tramo (múltiplos de SMMLV) del salario — 0 si el
// salario no alcanza el primer tramo (siempre 4 SMMLV, ver LaborParameters.solidarityFundBrackets).
function solidarityFundPercent(salaryValue, smlv, brackets) {
  const multiple = Number(salaryValue) / Number(smlv);
  const bracket = (brackets || []).find((b) => multiple >= b.minSmlv && (b.maxSmlv == null || multiple < b.maxSmlv));
  return bracket ? Number(bracket.percent) : 0;
}

// Deducciones de ley sobre la base de cotización (salario + horas extra + recargos — nunca el
// auxilio de transporte, que no es salario). Piso: la base de cotización mensual (proporcional a
// los días del período) no puede ser inferior a 1 SMMLV.
function computeDeductions({ baseAmount, salaryValue, daysWorked, params }) {
  const floor = (Number(params.smlv) / 30) * daysWorked;
  const cotizacionBase = Math.max(baseAmount, floor);
  const saludValue = cotizacionBase * (Number(params.saludPercent) / 100);
  const pensionValue = cotizacionBase * (Number(params.pensionPercent) / 100);
  const solidarityPercent = solidarityFundPercent(salaryValue, params.smlv, params.solidarityFundBrackets);
  const solidarityValue = solidarityPercent > 0 ? cotizacionBase * (solidarityPercent / 100) : 0;

  const items = [
    { concepto: 'Salud', formula: `${Number(params.saludPercent)}% de la base de cotización`, valores: { base: cotizacionBase, porcentaje: Number(params.saludPercent) }, valor: saludValue },
    { concepto: 'Pensión', formula: `${Number(params.pensionPercent)}% de la base de cotización`, valores: { base: cotizacionBase, porcentaje: Number(params.pensionPercent) }, valor: pensionValue },
  ];
  if (solidarityValue > 0) {
    items.push({
      concepto: 'Fondo de Solidaridad Pensional',
      formula: `${solidarityPercent}% de la base de cotización (salario >= 4 SMMLV)`,
      valores: { base: cotizacionBase, porcentaje: solidarityPercent },
      valor: solidarityValue,
    });
  }
  return { items, cotizacionBase, total: items.reduce((s, i) => s + i.valor, 0) };
}

module.exports = {
  days360, getEffectiveLaborParameters, computeAuxTransporte,
  OVERTIME_TYPES, hourlyRate, computeOvertimeItems, overtimeWarning,
  solidarityFundPercent, computeDeductions,
};
