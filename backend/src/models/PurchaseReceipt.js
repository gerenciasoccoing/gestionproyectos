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
    // Ya no se genera automáticamente (ver purchaseOrderController.addReceipt): nullable desde
    // siempre por eso, y se conserva por compatibilidad con recepciones históricas que sí lo
    // tenían (antes de la limpieza de gastos duplicados, ver postSyncFixups.js).
    expenseId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    // Trazabilidad de corrección: quién y cuándo corrigió la cantidad recibida después de
    // registrada (ver purchaseOrderController.updateReceipt, solo para administradores). Ambos
    // null si la recepción nunca se corrigió — createdBy/createdAt arriba siguen siendo el
    // registro original, esto es aparte.
    editedBy: { type: DataTypes.UUID, allowNull: true },
    editedAt: { type: DataTypes.DATE, allowNull: true },
  });

  PurchaseReceipt.associate = (models) => {
    PurchaseReceipt.belongsTo(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderItemId' });
    PurchaseReceipt.belongsTo(models.Expense, { foreignKey: 'expenseId' });
  };

  return PurchaseReceipt;
};
