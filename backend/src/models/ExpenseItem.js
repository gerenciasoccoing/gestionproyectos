const { DataTypes } = require('sequelize');

// Ítem individual de la factura de un gasto (cantidad, valor unitario, valor total).
module.exports = (sequelize) => {
  const ExpenseItem = sequelize.define('ExpenseItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    expenseId: { type: DataTypes.UUID, allowNull: false },
    // TEXT, no STRING/VARCHAR(255): recibe tal cual el nombre de PurchaseOrderItem cuando una
    // orden se convierte o se resincroniza a gasto (ver purchaseOrderController#updateOrder), que
    // también es TEXT por el mismo motivo (descripciones de dotación/EPP largas).
    description: { type: DataTypes.TEXT, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 1, validate: { min: 0 } },
    unitPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    totalPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
  });

  ExpenseItem.associate = (models) => {
    ExpenseItem.belongsTo(models.Expense, { foreignKey: 'expenseId' });
  };

  return ExpenseItem;
};
