const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const APU = sequelize.define('APU', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false },
    aiuPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
  });

  APU.associate = (models) => {
    APU.hasMany(models.APUComponent, { foreignKey: 'apuId', as: 'components', onDelete: 'CASCADE' });
    APU.hasMany(models.BudgetItem, { foreignKey: 'apuId' });
  };

  return APU;
};
