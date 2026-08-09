const { DataTypes } = require('sequelize');

// Un lote de carga/actualización del listado oficial de precios unitarios (ej. "Listado Marzo
// 2026"). Cada APU creado o actualizado por ese lote queda referenciado a él (APU.lastPriceListImportId)
// y cada cambio de costo queda registrado en APUPriceHistory con este id.
module.exports = (sequelize) => {
  const PriceListImport = sequelize.define('PriceListImport', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sourceLabel: { type: DataTypes.STRING, allowNull: false }, // ej. "Listado Marzo 2026"
    fileName: { type: DataTypes.STRING, allowNull: true },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    importedBy: { type: DataTypes.UUID, allowNull: true },
    apusCreated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    apusUpdated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    apusUnchanged: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  });

  PriceListImport.associate = (models) => {
    PriceListImport.hasMany(models.APU, { foreignKey: 'lastPriceListImportId', as: 'apus' });
    PriceListImport.hasMany(models.APUPriceHistory, { foreignKey: 'priceListImportId', as: 'priceHistory' });
  };

  return PriceListImport;
};
