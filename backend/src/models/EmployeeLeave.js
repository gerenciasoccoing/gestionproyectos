const { DataTypes } = require('sequelize');

// Novedad de nómina (incapacidad, vacaciones o licencia) de un trabajador — ver
// laborCalculations.js para cómo cada tipo afecta el cálculo de un período de nómina que se
// cruza con sus fechas. Un solo modelo para las 5 categorías (en vez de una tabla por tipo) porque
// todas comparten la misma forma (fecha inicio/fin, soporte adjunto) y se consultan juntas al
// calcular una nómina ("¿qué novedades tiene este trabajador en este período?").
module.exports = (sequelize) => {
  const EmployeeLeave = sequelize.define('EmployeeLeave', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    type: {
      type: DataTypes.ENUM('incapacidad_general', 'incapacidad_laboral', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada'),
      allowNull: false,
    },
    // Días CALENDARIO reales (no la convención comercial de 30 días usada para el salario
    // ordinario) — las incapacidades médicas y licencias se cuentan en días calendario reales por
    // ley, y las vacaciones necesitan fechas reales para poder excluir domingos/festivos (ver
    // laborCalculations.js#countBusinessDays).
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    // Solo para type='licencia_remunerada' (ver LeaveType.js).
    leaveTypeId: { type: DataTypes.UUID, allowNull: true },
    // Prórroga de una incapacidad anterior (mismo trabajador): el conteo de días para los tramos de
    // ley (2/90/180) sigue acumulando sobre esta cadena en vez de reiniciar en 1 — ver
    // laborCalculations.js#cumulativeLeaveDaysBefore. Solo tiene sentido para incapacidades.
    parentLeaveId: { type: DataTypes.UUID, allowNull: true },
    supportFilePath: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  EmployeeLeave.associate = (models) => {
    EmployeeLeave.belongsTo(models.Employee, { foreignKey: 'employeeId' });
    EmployeeLeave.belongsTo(models.LeaveType, { foreignKey: 'leaveTypeId' });
    EmployeeLeave.belongsTo(models.EmployeeLeave, { as: 'parentLeave', foreignKey: 'parentLeaveId' });
  };

  return EmployeeLeave;
};
