const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Contract = sequelize.define('Contract', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    object: { type: DataTypes.TEXT, allowNull: false },
    value: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    signedDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    filePath: { type: DataTypes.STRING },
  });

  Contract.associate = (models) => {
    Contract.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return Contract;
};
