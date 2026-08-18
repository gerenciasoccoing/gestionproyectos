const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ExpenseBudget = sequelize.define('ExpenseBudget', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    category: {
      type: DataTypes.ENUM('mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'),
      allowNull: false,
    },
    budgetedAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
  }, {
    indexes: [{ unique: true, fields: ['projectId', 'category'] }],
  });

  ExpenseBudget.associate = (models) => {
    ExpenseBudget.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return ExpenseBudget;
};
