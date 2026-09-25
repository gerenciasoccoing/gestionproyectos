const { DataTypes } = require('sequelize');

// Ingreso/adición de saldo a una caja (fecha + concepto). Los gastos NO generan una fila aquí:
// ya quedan registrados como Expense.cashBoxId, que es su propio lado del movimiento (débito).
// Esta tabla es solo el lado de los créditos/ingresos.
//
// amount SIGUE siendo el efecto real sobre el saldo de la caja (nunca cambió de significado, ver
// cashBoxService.getBalance, que no se tocó) — cuando el ingreso está asociado a un proyecto, ese
// valor ES el neto (bruto - retenciones, ver cashBoxMovementService.js), así que no existe una
// columna "netAmount" aparte: sería el mismo número duplicado. grossAmount es el valor bruto
// reconocido por el cliente cuando hay proyecto asociado; para un ingreso sin proyecto (o
// existente antes de esta migración) queda igual a amount, así que "Pagos al proyecto" y
// cualquier reporte pueden sumarlo siempre sin casos especiales.
module.exports = (sequelize) => {
  const CashBoxMovement = sequelize.define('CashBoxMovement', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    cashBoxId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0.01 } },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    concept: { type: DataTypes.STRING, allowNull: false },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    // Contrato/proyecto asociado (opcional — ver "Pagos al proyecto"). allowNull:true a propósito
    // (no solo por los ingresos sin proyecto: sync({alter:true}) tampoco podría agregar una
    // columna NOT NULL a una tabla con filas existentes, ver postSyncFixups.js).
    projectId: { type: DataTypes.UUID, allowNull: true },
    // Valor bruto/facturado reconocido por el cliente. Backfilleado a = amount para los ingresos
    // que ya existían antes de esta migración (ver postSyncFixups.js) y poblado siempre desde
    // cashBoxMovementService.js en adelante, aunque no haya proyecto — así nunca queda null en la
    // práctica, pero se deja allowNull:true por la misma razón que projectId.
    grossAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    supportFilePath: { type: DataTypes.STRING, allowNull: true },
    // Marca este ingreso como la devolución de UNA retención recuperable puntual (ver
    // CashBoxMovementWithholding.returned/returnMovementId) — no lleva retenciones propias.
    isWithholdingReturn: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    returnsWithholdingId: { type: DataTypes.UUID, allowNull: true },
  });

  CashBoxMovement.associate = (models) => {
    CashBoxMovement.belongsTo(models.CashBox, { foreignKey: 'cashBoxId' });
    CashBoxMovement.belongsTo(models.Project, { foreignKey: 'projectId' });
    CashBoxMovement.belongsTo(models.User, { foreignKey: 'createdBy' });
    CashBoxMovement.hasMany(models.CashBoxMovementWithholding, { foreignKey: 'cashBoxMovementId', as: 'withholdings', onDelete: 'CASCADE' });
  };

  return CashBoxMovement;
};
