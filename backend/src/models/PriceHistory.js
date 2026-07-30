const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PriceHistory = sequelize.define('PriceHistory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    priceItemId: { type: DataTypes.UUID, allowNull: false },
    value: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
  });

  PriceHistory.associate = (models) => {
    PriceHistory.belongsTo(models.PriceItem, { foreignKey: 'priceItemId' });
  };

  return PriceHistory;
};
