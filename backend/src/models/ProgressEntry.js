const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProgressEntry = sequelize.define('ProgressEntry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    budgetItemId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    quantityExecuted: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    notes: { type: DataTypes.TEXT },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  ProgressEntry.associate = (models) => {
    ProgressEntry.belongsTo(models.BudgetItem, { foreignKey: 'budgetItemId' });
    ProgressEntry.hasMany(models.ProgressPhoto, { foreignKey: 'progressEntryId', as: 'photos', onDelete: 'CASCADE' });
  };

  return ProgressEntry;
};
