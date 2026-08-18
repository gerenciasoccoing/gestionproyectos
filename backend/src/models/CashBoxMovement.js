const { DataTypes } = require('sequelize');

// Ingreso/adición de saldo a una caja (fecha + concepto). Los gastos NO generan una fila aquí:
// ya quedan registrados como Expense.cashBoxId, que es su propio lado del movimiento (débito).
// Esta tabla es solo el lado de los créditos/ingresos.
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
  });

  CashBoxMovement.associate = (models) => {
    CashBoxMovement.belongsTo(models.CashBox, { foreignKey: 'cashBoxId' });
  };

  return CashBoxMovement;
};
