const { DataTypes } = require('sequelize');

// Una línea por cada lote de origen consumido (PEPS o elegido a mano) — si un traslado necesita
// varios lotes para completar la cantidad pedida de un material, se generan varias líneas, cada una
// con SU lote y SU costo exacto (ver materialTransferService.js). quantityReceived queda null hasta
// que se confirma; si la confirmación trae menos de lo enviado, la diferencia es la merma/faltante
// de ESA línea (no se devuelve sola a origen — eso solo pasa si se rechaza el traslado completo).
module.exports = (sequelize) => {
  const MaterialTransferLine = sequelize.define('MaterialTransferLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: true },
    transferId: { type: DataTypes.UUID, allowNull: false },
    materialId: { type: DataTypes.UUID, allowNull: false },
    sourceLotId: { type: DataTypes.UUID, allowNull: false },
    quantitySent: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    quantityReceived: { type: DataTypes.DECIMAL(18, 4), allowNull: true },
    unitCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    // Lote ya creado/incrementado en la bodega destino al confirmar (null hasta entonces).
    destinationLotId: { type: DataTypes.UUID, allowNull: true },
  });

  MaterialTransferLine.associate = (models) => {
    MaterialTransferLine.belongsTo(models.MaterialTransfer, { foreignKey: 'transferId' });
    MaterialTransferLine.belongsTo(models.Material, { foreignKey: 'materialId' });
    MaterialTransferLine.belongsTo(models.MaterialLot, { foreignKey: 'sourceLotId', as: 'sourceLot' });
    MaterialTransferLine.belongsTo(models.MaterialLot, { foreignKey: 'destinationLotId', as: 'destinationLot' });
  };

  return MaterialTransferLine;
};
