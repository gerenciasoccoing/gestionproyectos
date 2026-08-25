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

module.exports = { days360, getEffectiveLaborParameters, computeAuxTransporte };
