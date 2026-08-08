const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseOrder = sequelize.define('PurchaseOrder', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    supplier: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM('abierta', 'parcial', 'cerrada', 'cerrada_con_faltantes'),
      defaultValue: 'abierta',
    },
    closureReason: { type: DataTypes.TEXT, allowNull: true },
    supplierId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional a Terceros (proveedor)
    // gasto generado por "Pasar a Gastos" (ver conversión en purchaseOrderController.convertToExpense).
    // Una vez asignado, la orden no puede convertirse de nuevo ni editar sus ítems.
    expenseId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  PurchaseOrder.associate = (models) => {
    PurchaseOrder.belongsTo(models.Project, { foreignKey: 'projectId' });
    PurchaseOrder.belongsTo(models.ThirdParty, { foreignKey: 'supplierId', as: 'supplierParty' });
    PurchaseOrder.belongsTo(models.Expense, { foreignKey: 'expenseId', as: 'expense' });
    PurchaseOrder.hasMany(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderId', as: 'items', onDelete: 'CASCADE' });
  };

  return PurchaseOrder;
};
