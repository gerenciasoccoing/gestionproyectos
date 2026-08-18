const { DataTypes } = require('sequelize');

// Impuesto individual que compone el total de la factura (IVA, ICA, retenciones, etc.).
module.exports = (sequelize) => {
  const ExpenseTax = sequelize.define('ExpenseTax', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    expenseId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false }, // ej. "IVA", "ICA", "Retención en la fuente"
    rate: { type: DataTypes.DECIMAL(6, 2), allowNull: true, validate: { min: 0 } }, // % (opcional)
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
  });

  ExpenseTax.associate = (models) => {
    ExpenseTax.belongsTo(models.Expense, { foreignKey: 'expenseId' });
  };

  return ExpenseTax;
};
