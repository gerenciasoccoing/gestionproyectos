const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Quotation = sequelize.define('Quotation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    clientName: { type: DataTypes.STRING, allowNull: false },
    clientId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional a Terceros (cliente)
    projectNameProposed: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    validityDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    paymentTerms: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('borrador', 'enviada', 'convertida'), defaultValue: 'borrador' },
    convertedProjectId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  Quotation.associate = (models) => {
    Quotation.hasMany(models.Budget, { foreignKey: 'quotationId', as: 'budgets' });
    Quotation.hasOne(models.Project, { foreignKey: 'quotationId', as: 'project' });
    Quotation.belongsTo(models.ThirdParty, { foreignKey: 'clientId', as: 'clientParty' });
  };

  return Quotation;
};
