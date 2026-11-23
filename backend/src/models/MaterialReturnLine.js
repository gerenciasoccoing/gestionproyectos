const { DataTypes } = require('sequelize');

// Una línea por cada MaterialIssueLine (de la salida de origen) que se está devolviendo —
// originIssueLineId es el ancla real: de ahí sale materialId/unitCost/el lote exacto a reponer, y
// contra ahí se valida el tope "no más de lo entregado menos lo ya devuelto" (ver
// materialReturnService.js). destinationLotId es el lote que recibió el crédito: el MISMO lote de
// origen si se devuelve a su misma bodega, o uno nuevo si se devuelve a otra (ver
// materialLotService.js#createLotFromTransfer).
module.exports = (sequelize) => {
  const MaterialReturnLine = sequelize.define('MaterialReturnLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: true },
    returnId: { type: DataTypes.UUID, allowNull: false },
    originIssueLineId: { type: DataTypes.UUID, allowNull: false },
    materialId: { type: DataTypes.UUID, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    unitCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    destinationLotId: { type: DataTypes.UUID, allowNull: true },
  });

  MaterialReturnLine.associate = (models) => {
    MaterialReturnLine.belongsTo(models.MaterialReturn, { foreignKey: 'returnId' });
    MaterialReturnLine.belongsTo(models.MaterialIssueLine, { foreignKey: 'originIssueLineId', as: 'originIssueLine' });
    MaterialReturnLine.belongsTo(models.Material, { foreignKey: 'materialId' });
    MaterialReturnLine.belongsTo(models.MaterialLot, { foreignKey: 'destinationLotId', as: 'destinationLot' });
  };

  return MaterialReturnLine;
};
