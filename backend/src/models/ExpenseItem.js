const { DataTypes } = require('sequelize');

// Ítem individual de la factura de un gasto (cantidad, valor unitario, valor total).
module.exports = (sequelize) => {
  const ExpenseItem = sequelize.define('ExpenseItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    expenseId: { type: DataTypes.UUID, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 1, validate: { min: 0 } },
    unitPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    totalPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
  });

  ExpenseItem.associate = (models) => {
    ExpenseItem.belongsTo(models.Expense, { foreignKey: 'expenseId' });
  };

  return ExpenseItem;
};
