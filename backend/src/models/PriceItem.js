const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PriceItem = sequelize.define('PriceItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.ENUM('material', 'mano_obra', 'equipo'), allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false },
    currentValue: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
  });

  PriceItem.associate = (models) => {
    PriceItem.hasMany(models.PriceHistory, { foreignKey: 'priceItemId', as: 'history' });
    PriceItem.hasMany(models.APUComponent, { foreignKey: 'priceItemId' });
  };

  return PriceItem;
};
