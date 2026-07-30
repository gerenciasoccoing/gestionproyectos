const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Quotation = sequelize.define('Quotation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    clientName: { type: DataTypes.STRING, allowNull: false },
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
  };

  return Quotation;
};
