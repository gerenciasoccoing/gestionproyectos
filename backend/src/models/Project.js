const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Project = sequelize.define('Project', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    client: { type: DataTypes.STRING },
    clientId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional a Terceros (cliente)
    description: { type: DataTypes.TEXT },
    status: {
      type: DataTypes.ENUM('activo', 'suspendido', 'terminado', 'liquidado'),
      defaultValue: 'activo',
    },
    origin: { type: DataTypes.ENUM('manual', 'cotizacion'), defaultValue: 'manual' },
    quotationId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    // Entidad contratante del proyecto: null = empresa principal (comportamiento por defecto, sin
    // cambios); si se asigna un consorcio/unión temporal, todos los documentos generados dentro de
    // este proyecto usan su membrete — ver services/letterheadService.js#getLetterheadForProject.
    consortiumId: { type: DataTypes.UUID, allowNull: true },
  });

  Project.associate = (models) => {
    Project.belongsToMany(models.User, { through: models.ProjectUser, foreignKey: 'projectId' });
    Project.belongsTo(models.Quotation, { foreignKey: 'quotationId', as: 'quotation' });
    Project.belongsTo(models.Consortium, { foreignKey: 'consortiumId', as: 'consortium' });
    Project.belongsTo(models.ThirdParty, { foreignKey: 'clientId', as: 'clientParty' });
    Project.hasMany(models.Contract, { foreignKey: 'projectId', as: 'contracts' });
    Project.hasMany(models.Policy, { foreignKey: 'projectId', as: 'policies' });
    Project.hasMany(models.Minute, { foreignKey: 'projectId', as: 'minutes' });
    Project.hasMany(models.Milestone, { foreignKey: 'projectId', as: 'milestones' });
    Project.hasMany(models.PurchaseOrder, { foreignKey: 'projectId', as: 'purchaseOrders' });
    Project.hasMany(models.Employee, { foreignKey: 'projectId', as: 'employees' });
    Project.hasMany(models.Expense, { foreignKey: 'projectId', as: 'expenses' });
    Project.hasMany(models.ExpenseBudget, { foreignKey: 'projectId', as: 'expenseBudgets' });
    Project.hasMany(models.Risk, { foreignKey: 'projectId', as: 'risks' });
    Project.hasMany(models.Budget, { foreignKey: 'projectId', as: 'budgets' });
  };

  return Project;
};
