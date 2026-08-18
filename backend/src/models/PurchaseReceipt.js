const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseReceipt = sequelize.define('PurchaseReceipt', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    purchaseOrderItemId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    quantityReceived: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    notes: { type: DataTypes.TEXT },
    expenseId: { type: DataTypes.UUID, allowNull: true }, // gasto generado automáticamente
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  PurchaseReceipt.associate = (models) => {
    PurchaseReceipt.belongsTo(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderItemId' });
    PurchaseReceipt.belongsTo(models.Expense, { foreignKey: 'expenseId' });
  };

  return PurchaseReceipt;
};
