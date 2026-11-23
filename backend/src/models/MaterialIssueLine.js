const { DataTypes } = require('sequelize');

// Una línea por cada lote de origen consumido (PEPS o elegido a mano) — si una salida necesita
// varios lotes para completar la cantidad de un material, se generan varias líneas, cada una con SU
// lote y SU costo exacto (ver materialIssueService.js, mismo criterio que MaterialTransferLine).
// salePriceUnit es OPCIONAL (lo que se cobró ese material en el contrato) — se deja vacío cuando no
// aplica, para que el análisis de margen (Fase 7) pueda separar los ítems sin precio de venta.
module.exports = (sequelize) => {
  const MaterialIssueLine = sequelize.define('MaterialIssueLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    materialId: { type: DataTypes.UUID, allowNull: false },
    sourceLotId: { type: DataTypes.UUID, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    unitCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    salePriceUnit: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
  });

  MaterialIssueLine.associate = (models) => {
    MaterialIssueLine.belongsTo(models.MaterialIssue, { foreignKey: 'issueId' });
    MaterialIssueLine.belongsTo(models.Material, { foreignKey: 'materialId' });
    MaterialIssueLine.belongsTo(models.MaterialLot, { foreignKey: 'sourceLotId', as: 'sourceLot' });
  };

  return MaterialIssueLine;
};
