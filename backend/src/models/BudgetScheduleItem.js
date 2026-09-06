const { DataTypes } = require('sequelize');

// Cronograma con IA (ver scheduleService.js, Ejecución de Proyecto): una fila por ítem de
// presupuesto con su fecha estimada de inicio/fin dentro del rango del contrato. Se regenera
// completo en cada "Generar cronograma" (se borran las filas existentes de los ítems del
// presupuesto vigente y se crean de nuevo) — no es un historial de versiones, es el cronograma
// vigente. Las fechas las calcula siempre el backend (nunca directo de la IA, ver
// scheduleService.distributeDates) para garantizar que ninguna caiga fuera de
// Contract.signedDate/endDate.
module.exports = (sequelize) => {
  const BudgetScheduleItem = sequelize.define('BudgetScheduleItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    budgetItemId: { type: DataTypes.UUID, allowNull: false },
    // Orden de secuencia constructiva sugerido por la IA (ej. cimentación antes que muros).
    sequenceOrder: { type: DataTypes.INTEGER, allowNull: false },
    plannedStart: { type: DataTypes.DATEONLY, allowNull: false },
    plannedEnd: { type: DataTypes.DATEONLY, allowNull: false },
  });

  BudgetScheduleItem.associate = (models) => {
    BudgetScheduleItem.belongsTo(models.BudgetItem, { foreignKey: 'budgetItemId' });
  };

  return BudgetScheduleItem;
};
