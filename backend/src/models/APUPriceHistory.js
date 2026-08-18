const { DataTypes } = require('sequelize');

// Histórico del costo directo (Total Unitario, sin AIU) de un APU en el tiempo. Se registra al
// crear el APU y cada vez que su costo cambia por una actualización del listado de precios (o
// una edición manual). priceListImportId queda null cuando el cambio viene de una edición manual
// en vez de una carga de listado.
module.exports = (sequelize) => {
  const APUPriceHistory = sequelize.define('APUPriceHistory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    apuId: { type: DataTypes.UUID, allowNull: false },
    priceListImportId: { type: DataTypes.UUID, allowNull: true },
    directCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
  });

  APUPriceHistory.associate = (models) => {
    APUPriceHistory.belongsTo(models.APU, { foreignKey: 'apuId' });
    APUPriceHistory.belongsTo(models.PriceListImport, { foreignKey: 'priceListImportId' });
  };

  return APUPriceHistory;
};
