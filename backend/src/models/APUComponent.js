const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const APUComponent = sequelize.define('APUComponent', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    apuId: { type: DataTypes.UUID, allowNull: false },
    priceItemId: { type: DataTypes.UUID, allowNull: false },
    yield: { type: DataTypes.DECIMAL(18, 6), allowNull: false, validate: { min: 0 } }, // rendimiento/cantidad requerida
  });

  APUComponent.associate = (models) => {
    APUComponent.belongsTo(models.APU, { foreignKey: 'apuId' });
    APUComponent.belongsTo(models.PriceItem, { foreignKey: 'priceItemId', as: 'priceItem' });
  };

  return APUComponent;
};
