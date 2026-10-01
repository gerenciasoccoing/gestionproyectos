// Piezas de cálculo laboral compartidas entre liquidación (severanceService.js), nómina
// (payrollService.js) y el valor de contrato por rango de días (employeeController.js) — una sola
// fuente de verdad para que los tres usen exactamente la misma convención de días y de auxilio de
// transporte, en vez de fórmulas ligeramente distintas mantenidas por separado en cada lugar.
const { Op } = require('sequelize');
const { LaborParameters, PublicHoliday, EmployeeLeave } = require('../models');

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

// ====================== Novedades (incapacidades, vacaciones, licencias) ======================
// Dos convenciones de "días" distintas y DELIBERADAS, no una inconsistencia:
// - Para restar de los días trabajados de un período de nómina (clipRange/overlapDays360 abajo) se
//   usa la misma convención comercial de 30 días que ya usa days360 para el resto del salario —
//   consistente con cómo ya se prorratea todo lo demás en este archivo.
// - Para los TRAMOS de incapacidad (día 1, día 2, día 90...) y para el SALDO de vacaciones (días
//   hábiles) se usan fechas calendario reales, porque la ley cuenta esos días tal cual (incluidos
//   domingos en incapacidad; excluidos domingos/festivos en el saldo de vacaciones) — mezclar la
//   convención comercial ahí daría tramos y saldos incorrectos.

function clipRange(aStart, aEnd, bStart, bEnd) {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return start <= end ? { start, end } : null;
}

// Intersección de una novedad con el período de nómina, en días de la convención comercial —
// cuántos días del período hay que restar de "días efectivamente trabajados" por esta novedad.
function overlapDays360(leaveStart, leaveEnd, periodStart, periodEnd) {
  const clip = clipRange(leaveStart, leaveEnd, periodStart, periodEnd);
  return clip ? days360(clip.start, clip.end) : 0;
}

function realCalendarDays(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

// Días hábiles (excluye domingos y festivos de PublicHoliday) entre dos fechas reales, inclusive —
// usado SOLO para el saldo de vacaciones (días disfrutados), nunca para el cálculo de nómina.
async function countBusinessDays(startDate, endDate) {
  const holidays = await PublicHoliday.findAll({ where: { date: { [Op.between]: [startDate, endDate] } } });
  const holidaySet = new Set(holidays.map((h) => h.date));
  let count = 0;
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    if (cursor.getUTCDay() !== 0 && !holidaySet.has(iso)) count += 1; // excluye domingo (0) y festivos
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// Suma de días calendario reales de todos los ancestros de una incapacidad (cadena de prórrogas,
// ver EmployeeLeave.parentLeaveId) — para que el conteo de tramos (día 1, 2, 90...) continúe en vez
// de reiniciar en cada prórroga nueva.
async function cumulativeLeaveDaysBefore(leave) {
  let total = 0;
  let current = leave;
  while (current.parentLeaveId) {
    // eslint-disable-next-line no-await-in-loop
    const parent = await EmployeeLeave.findByPk(current.parentLeaveId);
    if (!parent) break;
    total += realCalendarDays(parent.startDate, parent.endDate);
    current = parent;
  }
  return total;
}

function tramoFor(absoluteDay, tramos) {
  return tramos.find((t) => absoluteDay >= t.desde && absoluteDay <= t.hasta) || tramos[tramos.length - 1];
}

// Incapacidad por enfermedad general: recorre día a día la porción de la incapacidad que cae
// dentro del período de nómina, determina el tramo (y por tanto el % y quién lo asume) de CADA día
// según su número absoluto en la cadena de prórrogas, con piso de 1 SMMLV diario — y agrupa el
// resultado por (pagador, %) en vez de una línea por día, para que el comprobante quede legible.
function incapacidadGeneralSplit({ leave, periodStart, periodEnd, salaryValue, params, cumulativeDaysBefore }) {
  const clip = clipRange(leave.startDate, leave.endDate, periodStart, periodEnd);
  if (!clip) return { items: [], total: 0 };
  const dailySalary = Number(salaryValue) / 30;
  const smlvDaily = Number(params.smlv) / 30;
  const tramos = params.incapacidadGeneralTramos;

  const groups = new Map();
  const cursor = new Date(clip.start);
  const end = new Date(clip.end);
  const leaveStart = new Date(leave.startDate);
  while (cursor <= end) {
    const offsetFromLeaveStart = Math.round((cursor - leaveStart) / 86400000);
    const absoluteDay = cumulativeDaysBefore + offsetFromLeaveStart + 1;
    const tramo = tramoFor(absoluteDay, tramos);
    const dayValue = Math.max(dailySalary * (Number(tramo.percent) / 100), smlvDaily);
    const key = `${tramo.pagador}|${tramo.percent}`;
    const g = groups.get(key) || { pagador: tramo.pagador, percent: Number(tramo.percent), days: 0, value: 0 };
    g.days += 1;
    g.value += dayValue;
    groups.set(key, g);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const items = [...groups.values()].map((g) => ({
    concepto: `Incapacidad general — ${g.days} día(s) a cargo de ${g.pagador === 'empleador' ? 'empleador' : 'EPS'} (${g.percent}%)`,
    formula: `máx(salario diario x ${g.percent}%, SMMLV diario) x ${g.days} día(s)`,
    valores: { dias: g.days, percent: g.percent, pagador: g.pagador },
    valor: g.value,
  }));
  return { items, total: items.reduce((s, i) => s + i.valor, 0) };
}

// Incapacidad por accidente o enfermedad LABORAL: solo el primer día absoluto de la cadena es a
// cargo del empleador (al 100%); el resto, a cargo de la ARL (también al 100% — sin tramos).
function incapacidadLaboralSplit({ leave, periodStart, periodEnd, salaryValue, cumulativeDaysBefore }) {
  const clip = clipRange(leave.startDate, leave.endDate, periodStart, periodEnd);
  if (!clip) return { items: [], total: 0 };
  const dailySalary = Number(salaryValue) / 30;

  const groups = new Map();
  const cursor = new Date(clip.start);
  const end = new Date(clip.end);
  const leaveStart = new Date(leave.startDate);
  while (cursor <= end) {
    const offsetFromLeaveStart = Math.round((cursor - leaveStart) / 86400000);
    const absoluteDay = cumulativeDaysBefore + offsetFromLeaveStart + 1;
    const pagador = absoluteDay === 1 ? 'empleador' : 'arl';
    const g = groups.get(pagador) || { pagador, days: 0, value: 0 };
    g.days += 1;
    g.value += dailySalary;
    groups.set(pagador, g);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const items = [...groups.values()].map((g) => ({
    concepto: `Incapacidad laboral — ${g.days} día(s) a cargo de ${g.pagador === 'empleador' ? 'empleador' : 'ARL'} (100%)`,
    formula: `salario diario x 100% x ${g.days} día(s)`,
    valores: { dias: g.days, percent: 100, pagador: g.pagador },
    valor: g.value,
  }));
  return { items, total: items.reduce((s, i) => s + i.valor, 0) };
}

// Vacaciones y licencias remuneradas: se pagan al salario básico ordinario vigente, sobre los días
// del período que caen dentro de la novedad (convención comercial, igual que el resto del salario).
function simpleLeavePay({ concepto, overlapDays, salaryValue }) {
  if (overlapDays <= 0) return null;
  const valor = (Number(salaryValue) / 30) * overlapDays;
  return {
    concepto,
    formula: '(salario mensual / 30) x días del período',
    valores: { dias: overlapDays, salarioMensual: Number(salaryValue) },
    valor,
  };
}

// ====================== Otros descuentos (préstamos, libranzas, embargos, otros) ======================

const DEDUCTION_TYPE_LABELS = {
  prestamo: 'Préstamo/anticipo',
  libranza: 'Libranza',
  embargo: 'Embargo judicial',
  otro: 'Otro descuento autorizado',
};

// Tope legal de un embargo de salario (CST arts. 154-155, Ley 1527/2012 para libranza no aplica
// acá: esto es para embargo judicial, de naturaleza distinta). 'alimentos' (cuota alimentaria a
// favor de hijos/cónyuge): hasta el 50% del salario total. 'ordinario' (cualquier otra deuda,
// civil o comercial): solo el exceso sobre 1 SMMLV es embargable, y de ese exceso solo 1/5.
function embargoLegalCap({ embargoKind, cotizacionBase, smlv, daysWorked }) {
  if (embargoKind === 'alimentos') return cotizacionBase * 0.5;
  const smlvProrated = (Number(smlv) / 30) * daysWorked;
  const excess = Math.max(cotizacionBase - smlvProrated, 0);
  return excess / 5;
}

// Aplica sobre la base de cotización del período las deducciones vigentes del trabajador
// (préstamos/libranzas/embargos/otros) más, si se informó, el valor manual de retención en la
// fuente de este período puntual (sección 4d/4e de la especificación: retefuente no es una cuota
// recurrente con saldo, se captura período a período igual que las horas extra).
// Devuelve además `applied` (deductionId -> monto realmente aplicado) para que el llamador
// decremente el saldo SOLO al confirmar la nómina (preview no debe tocar ningún saldo).
function computeOtherDeductions({ deductions, cotizacionBase, smlv, daysWorked, retefuente }) {
  const items = [];
  const applied = [];
  for (const d of deductions || []) {
    if (!d.active) continue;
    let amount = Number(d.installmentAmount);
    if (d.balance != null) amount = Math.min(amount, Number(d.balance));
    let formula = 'Cuota fija registrada para este descuento';
    if (d.type === 'embargo') {
      const cap = embargoLegalCap({ embargoKind: d.embargoKind, cotizacionBase, smlv, daysWorked });
      if (amount > cap) {
        formula = `Cuota registrada limitada al tope legal de embargo (${d.embargoKind === 'alimentos' ? '50% del salario' : '1/5 del exceso sobre 1 SMMLV'})`;
        amount = Math.max(cap, 0);
      }
    }
    if (amount <= 0) continue;
    items.push({
      concepto: `${DEDUCTION_TYPE_LABELS[d.type]} — ${d.concept}`,
      formula,
      valores: { deductionId: d.id, type: d.type },
      valor: amount,
    });
    applied.push({ id: d.id, amount });
  }
  if (Number(retefuente) > 0) {
    items.push({
      concepto: 'Retención en la fuente',
      formula: 'Valor manual ingresado para este período (no es una cuota recurrente)',
      valores: {},
      valor: Number(retefuente),
    });
  }
  return { items, total: items.reduce((s, i) => s + i.valor, 0), applied };
}

// Advertencia (no bloquea el cálculo) si el neto a pagar del período queda por debajo del SMMLV
// proporcional a los días trabajados — protección de salario mínimo (CST art. 149-150: ningún
// descuento, ni siquiera autorizado por el trabajador, puede dejarlo por debajo del mínimo).
function netPayWarning(netPay, smlv, daysWorked) {
  const floor = (Number(smlv) / 30) * daysWorked;
  if (netPay < floor) {
    return `El neto a pagar de este período (${netPay.toFixed(0)}) queda por debajo del salario mínimo proporcional a los días trabajados (${floor.toFixed(0)}). Revisa los descuentos aplicados antes de confirmar.`;
  }
  return null;
}

// Saldo de vacaciones de un trabajador: causadas (15 días hábiles por año de servicio, proporcional
// — misma proporción que ya usa severanceService.js con vacacionesDivisor=720, equivalente a 15
// días por cada 360 trabajados), disfrutadas (días hábiles reales de cada período de vacaciones ya
// registrado) y pendientes.
async function getVacationBalance(employee) {
  const endRef = employee.exitDate || new Date().toISOString().slice(0, 10);
  const totalDaysWorked = days360(employee.entryDate, endRef);
  const accruedDays = (totalDaysWorked * 15) / 360;

  const leaves = await EmployeeLeave.findAll({ where: { employeeId: employee.id, type: 'vacaciones' } });
  let takenDays = 0;
  for (const leave of leaves) {
    // eslint-disable-next-line no-await-in-loop
    takenDays += await countBusinessDays(leave.startDate, leave.endDate);
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  return { accruedDays: round2(accruedDays), takenDays, pendingDays: round2(accruedDays - takenDays) };
}

module.exports = {
  days360, getEffectiveLaborParameters, computeAuxTransporte,
  OVERTIME_TYPES, hourlyRate, computeOvertimeItems, overtimeWarning,
  solidarityFundPercent, computeDeductions,
  clipRange, overlapDays360, countBusinessDays, cumulativeLeaveDaysBefore,
  incapacidadGeneralSplit, incapacidadLaboralSplit, simpleLeavePay, getVacationBalance,
  DEDUCTION_TYPE_LABELS, embargoLegalCap, computeOtherDeductions, netPayWarning,
};
