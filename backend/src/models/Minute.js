const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Minute = sequelize.define('Minute', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    type: {
      type: DataTypes.ENUM('inicio', 'suspension', 'reinicio', 'terminacion', 'final', 'liquidacion'),
      allowNull: false,
    },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    filePath: { type: DataTypes.STRING, allowNull: false },
  });

  Minute.associate = (models) => {
    Minute.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return Minute;
};
