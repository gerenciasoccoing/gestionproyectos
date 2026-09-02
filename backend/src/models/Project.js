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
    // No. de contrato (adjudicación/licitación) que identifica a este proyecto frente al cliente.
    // Se lee automáticamente al escanear un contrato en la sección Contractual, o se edita a mano.
    // Sus primeros 3 dígitos se usan como prefijo visual en gastos/órdenes de compra/contratos
    // laborales creados DESDE ESTE MOMENTO (ver numberingService.js) — cambiarlo después no
    // recalcula el prefijo de lo ya creado, para no alterar referencias existentes.
    contractNumber: { type: DataTypes.STRING, allowNull: true },
    // Lugar de ejecución del proyecto (texto libre, ej. dirección u obra). Usado en la portada del
    // Informe para Cliente (ver reportEngineService.js) — editable desde Contractual, igual que
    // contractNumber.
    address: { type: DataTypes.STRING, allowNull: true },
    // Foto de presentación del proyecto y captura/pantallazo del mapa de ubicación: ambas de carga
    // manual (sin geocodificación automática), mostradas juntas en la portada del Informe para
    // Cliente. Editables desde Contractual (ContractualPage.jsx > "Presentación del proyecto").
    presentationPhotoPath: { type: DataTypes.STRING, allowNull: true },
    locationMapImagePath: { type: DataTypes.STRING, allowNull: true },
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
