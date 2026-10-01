const { DataTypes } = require('sequelize');

// Catálogo de licencias remuneradas por empresa (Administración > Parámetros), usado al registrar
// una novedad de tipo 'licencia_remunerada' (ver EmployeeLeave.js). "paidBy" indica quién asume el
// costo al final (para la trazabilidad de qué es reconocible/cobrable, igual criterio que la
// incapacidad) — el trabajador siempre recibe el pago completo por nómina sin importar este valor,
// 'paidBy' solo afecta a quién se le gestiona el cobro después. Nunca se elimina un tipo ya usado
// en una novedad — solo se desactiva (active=false), mismo patrón que WithholdingType/
// AdminExpenseCategory.
module.exports = (sequelize) => {
  const LeaveType = sequelize.define('LeaveType', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    // Duración sugerida en días CALENDARIO al registrar la novedad (prellenar fecha fin) — no es un
    // tope obligatorio, se puede ajustar caso a caso.
    defaultDurationDays: { type: DataTypes.INTEGER, allowNull: true },
    paidBy: { type: DataTypes.ENUM('empleador', 'eps', 'arl'), allowNull: false, defaultValue: 'empleador' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  LeaveType.associate = (models) => {
    LeaveType.hasMany(models.EmployeeLeave, { foreignKey: 'leaveTypeId' });
  };

  return LeaveType;
};
