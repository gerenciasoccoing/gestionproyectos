const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Policy = sequelize.define('Policy', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    coverageStart: { type: DataTypes.DATEONLY, allowNull: false },
    coverageEnd: { type: DataTypes.DATEONLY, allowNull: false },
    filePath: { type: DataTypes.STRING },
  });

  Policy.associate = (models) => {
    Policy.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return Policy;
};
