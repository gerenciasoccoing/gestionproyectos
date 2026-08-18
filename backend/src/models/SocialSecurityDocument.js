const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SocialSecurityDocument = sequelize.define('SocialSecurityDocument', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('salud', 'arl', 'pension'), allowNull: false },
    filePath: { type: DataTypes.STRING, allowNull: false },
    uploadDate: { type: DataTypes.DATEONLY, allowNull: false },
  });

  SocialSecurityDocument.associate = (models) => {
    SocialSecurityDocument.belongsTo(models.Employee, { foreignKey: 'employeeId' });
  };

  return SocialSecurityDocument;
};
