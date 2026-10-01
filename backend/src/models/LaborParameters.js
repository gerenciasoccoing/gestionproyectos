const { DataTypes } = require('sequelize');

// Parámetros legales colombianos, versionados por fecha de vigencia (cambian cada año/reforma).
module.exports = (sequelize) => {
  const LaborParameters = sequelize.define('LaborParameters', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    smlv: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } }, // salario mínimo legal vigente
    auxTransporte: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    cesantiasDivisor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 360 },
    interesesCesantiasPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 12 },
    primaDivisor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 360 },
    vacacionesDivisor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 720 },
    topeAuxTransporteSalarios: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 2 }, // salarios <= 2 SMLV reciben aux. transporte

    // --- Horas extra y recargos (ver laborCalculations.js#computeOvertimeItems) ---
    // Jornada mensual para el valor de la hora ordinaria (salario / horasMensuales). 210 = 42
    // horas semanales (Ley 2101 de 2021, jornada vigente); queda editable porque la ley la sigue
    // reduciendo por tramos en los años siguientes.
    horasMensuales: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 210 },
    // Horas EXTRA (fuera de jornada): % sobre el valor hora ordinaria, se paga la hora completa
    // MÁS el recargo (100% + este %). Recargos (dentro de jornada, solo cambia el horario): se
    // paga SOLO este % adicional, la hora ordinaria ya está pagada en el salario básico.
    horaExtraDiurnaPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 25 },
    horaExtraNocturnaPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 75 },
    recargoNocturnoPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 35 },
    recargoDominicalPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 90 },
    recargoNocturnoDominicalPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 125 },
    horaExtraDiurnaDominicalPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 115 },
    horaExtraNocturnaDominicalPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 165 },
    // Informativos (para mostrarlos en pantalla al capturar horas); el cálculo en sí no necesita
    // saber relojes exactos, solo la cantidad de horas de cada tipo que ya viene clasificada.
    horarioNocturnoInicio: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '19:00' },
    horarioNocturnoFin: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '06:00' },
    // Topes legales (2 horas extra diarias, 12 semanales) para la advertencia — ver
    // laborCalculations.js#overtimeWarning.
    topeHorasExtraDiarias: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 2 },
    topeHorasExtraSemanales: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 12 },

    // --- Deducciones de ley (ver laborCalculations.js#computeDeductions) ---
    saludPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 4 },
    pensionPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 4 },
    // Fondo de Solidaridad Pensional: por tramos de múltiplos de SMMLV (aplica desde 4 SMMLV), no
    // un único porcentaje — se guarda como arreglo [{ minSmlv, maxSmlv (null = sin techo), percent }]
    // en vez de una tabla aparte porque los tramos cambian junto con el resto de esta vigencia, no
    // de forma independiente. Rangos vigentes a 2026 (Ley 100/1993 art. 27, con los ajustes de
    // Ley 797/2003): revisar y ajustar aquí cuando cambie la norma, nunca hardcoded en el código.
    solidarityFundBrackets: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [
        { minSmlv: 4, maxSmlv: 16, percent: 1 },
        { minSmlv: 16, maxSmlv: 17, percent: 1.2 },
        { minSmlv: 17, maxSmlv: 18, percent: 1.4 },
        { minSmlv: 18, maxSmlv: 19, percent: 1.6 },
        { minSmlv: 19, maxSmlv: 20, percent: 1.8 },
        { minSmlv: 20, maxSmlv: null, percent: 2 },
      ],
    },

    // --- Novedades (ver laborCalculations.js#incapacidadGeneralDailySplit y EmployeeLeave.js) ---
    // Tramos de incapacidad general (enfermedad común): día de inicio/fin de cada tramo (1-based,
    // acumulado sobre la cadena de prórrogas) y el % del salario diario que reconoce. Array en vez
    // de columnas fijas para poder agregar/ajustar tramos sin migrar el esquema.
    incapacidadGeneralTramos: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [
        { desde: 1, hasta: 2, percent: 66.67, pagador: 'empleador' },
        { desde: 3, hasta: 90, percent: 66.67, pagador: 'eps' },
        { desde: 91, hasta: 180, percent: 50, pagador: 'eps' },
      ],
    },
    // Si durante una licencia no remunerada se mantienen o no los aportes a seguridad social (y
    // quién los asume) — no afecta el cálculo de nómina en sí (no hay devengado del que descontar
    // en esos días), es solo la nota/regla que se muestra al registrar la novedad.
    licenciaNoRemuneradaMantieneSeguridadSocial: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    notes: { type: DataTypes.TEXT },
  });

  return LaborParameters;
};
