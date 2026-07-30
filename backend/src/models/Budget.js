const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Budget = sequelize.define('Budget', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    quotationId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    type: { type: DataTypes.ENUM('inicial', 'ajustado'), defaultValue: 'inicial' },
  });

  Budget.associate = (models) => {
    Budget.belongsTo(models.Quotation, { foreignKey: 'quotationId' });
    Budget.belongsTo(models.Project, { foreignKey: 'projectId' });
    Budget.hasMany(models.BudgetItem, { foreignKey: 'budgetId', as: 'items', onDelete: 'CASCADE' });
  };

  return Budget;
};
