const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseOrderItem = sequelize.define('PurchaseOrderItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    purchaseOrderId: { type: DataTypes.UUID, allowNull: false },
    budgetItemId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional al ítem de presupuesto
    name: { type: DataTypes.STRING, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false },
    quantityOrdered: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    unitPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    totalValue: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
  });

  PurchaseOrderItem.associate = (models) => {
    PurchaseOrderItem.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId' });
    PurchaseOrderItem.belongsTo(models.BudgetItem, { foreignKey: 'budgetItemId' });
    PurchaseOrderItem.hasMany(models.PurchaseReceipt, { foreignKey: 'purchaseOrderItemId', as: 'receipts', onDelete: 'CASCADE' });
  };

  return PurchaseOrderItem;
};
