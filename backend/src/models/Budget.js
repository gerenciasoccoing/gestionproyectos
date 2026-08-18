const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Budget = sequelize.define('Budget', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    quotationId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    type: { type: DataTypes.ENUM('inicial', 'ajustado'), defaultValue: 'inicial' },
    // AIU discriminado: se define al crear el presupuesto y se aplica sobre el costo directo
    // de cada ítem basado en APU al agregarlo (Administración + Imprevistos + Utilidad).
    adminPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    imprevistosPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    utilidadPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
  });

  Budget.associate = (models) => {
    Budget.belongsTo(models.Quotation, { foreignKey: 'quotationId' });
    Budget.belongsTo(models.Project, { foreignKey: 'projectId' });
    Budget.hasMany(models.BudgetItem, { foreignKey: 'budgetId', as: 'items', onDelete: 'CASCADE' });
  };

  return Budget;
};
