const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SocialSecurityDocument = sequelize.define('SocialSecurityDocument', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
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
