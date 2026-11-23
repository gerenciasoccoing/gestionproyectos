const { DataTypes } = require('sequelize');

// Traslado de material entre bodegas (ver materialTransferService.js): al registrarse descuenta
// de inmediato la disponibilidad de los lotes de origen (el material "sale" aunque todavía no esté
// disponible en destino — status 'en_transito') y solo acredita lotes nuevos en la bodega destino
// cuando se confirma la recepción (firmada, ver MaterialMovementSignature). Si se rechaza, el
// material vuelve íntegro a los mismos lotes de origen.
module.exports = (sequelize) => {
  const MaterialTransfer = sequelize.define('MaterialTransfer', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    transferNumber: { type: DataTypes.INTEGER, allowNull: true },
    fromWarehouseId: { type: DataTypes.UUID, allowNull: false },
    toWarehouseId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('en_transito', 'confirmado', 'rechazado'), allowNull: false, defaultValue: 'en_transito' },
    observations: { type: DataTypes.TEXT, allowNull: true },
    // Obligatoria si se rechaza, o si se confirma con alguna línea recibida por debajo de lo
    // enviado (faltante) — validado en el servicio, no en el modelo.
    shortageObservation: { type: DataTypes.TEXT, allowNull: true },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    confirmedBy: { type: DataTypes.UUID, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  MaterialTransfer.associate = (models) => {
    MaterialTransfer.belongsTo(models.Warehouse, { foreignKey: 'fromWarehouseId', as: 'fromWarehouse' });
    MaterialTransfer.belongsTo(models.Warehouse, { foreignKey: 'toWarehouseId', as: 'toWarehouse' });
    MaterialTransfer.hasMany(models.MaterialTransferLine, { foreignKey: 'transferId', as: 'lines', onDelete: 'CASCADE' });
    MaterialTransfer.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
  };

  return MaterialTransfer;
};
