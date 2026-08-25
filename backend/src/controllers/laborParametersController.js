const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { LaborParameters } = require('../models');
const { getEffectiveLaborParameters } = require('../services/laborCalculations');

const list = asyncHandler(async (req, res) => {
  const params = await LaborParameters.findAll({ order: [['effectiveDate', 'DESC']] });
  res.json(params);
});

// Los parámetros vigentes HOY (SMLV + auxilio de transporte, sobre todo) — usado para precargar el
// salario por defecto y mostrar el auxilio de transporte al dar de alta o editar un trabajador
// (ver PersonnelListPage.jsx / EmployeeDetailPage.jsx). Gated por 'personal' en vez de 'admin' a
// propósito: cualquiera que pueda crear/editar personal necesita poder leer esto, no solo quien
// administra los parámetros.
const current = asyncHandler(async (req, res) => {
  const params = await getEffectiveLaborParameters(new Date().toISOString().slice(0, 10));
  res.json(params);
});

// Crea una nueva versión de parámetros vigente desde effectiveDate (la normativa cambia periódicamente).
const create = asyncHandler(async (req, res) => {
  const {
    effectiveDate, smlv, auxTransporte, cesantiasDivisor, interesesCesantiasPercent,
    primaDivisor, vacacionesDivisor, topeAuxTransporteSalarios, indemnizacionRules, notes,
  } = req.body;
  if (!effectiveDate || smlv === undefined || smlv === '') throw new ApiError(400, 'effectiveDate y smlv son obligatorios');
  if (Number(smlv) < 0) throw new ApiError(400, 'smlv no puede ser negativo');

  const orDefault = (value, fallback) => (value === undefined || value === null || value === '' ? fallback : value);

  const params = await LaborParameters.create({
    effectiveDate,
    smlv,
    auxTransporte: orDefault(auxTransporte, 0),
    cesantiasDivisor: orDefault(cesantiasDivisor, 360),
    interesesCesantiasPercent: orDefault(interesesCesantiasPercent, 12),
    primaDivisor: orDefault(primaDivisor, 360),
    vacacionesDivisor: orDefault(vacacionesDivisor, 720),
    topeAuxTransporteSalarios: orDefault(topeAuxTransporteSalarios, 2),
    indemnizacionRules: indemnizacionRules ?? { baseDays: 30, extraDaysPerYear: 20, thresholdYears: 1 },
    notes,
  });
  res.status(201).json(params);
});

module.exports = { list, current, create };
