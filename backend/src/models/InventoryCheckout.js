const { DataTypes } = require('sequelize');

// Salida (préstamo) de uno o más equipos/herramientas. `status` pasa a 'cerrada' automáticamente
// cuando todas sus líneas (InventoryCheckoutItem) quedan resueltas (devueltas y/o justificadas
// como faltante), ver inventoryService.maybeCloseCheckout.
module.exports = (sequelize) => {
  const InventoryCheckout = sequelize.define('InventoryCheckout', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Destino: proyecto formal (opcional) y/o texto libre (obra/lugar que no es un Project del sistema).
    projectId: { type: DataTypes.UUID, allowNull: true },
    destinationText: { type: DataTypes.STRING, allowNull: true },
    // Responsable a quien se entrega: empleado o tercero del catálogo, o nombre libre si no está
    // en ninguno (mismo patrón de FK-nullable-doble usado en PurchaseOrder.supplierId + supplier).
    responsibleEmployeeId: { type: DataTypes.UUID, allowNull: true },
    responsibleThirdPartyId: { type: DataTypes.UUID, allowNull: true },
    responsibleName: { type: DataTypes.STRING, allowNull: true },
    authorizedByUserId: { type: DataTypes.UUID, allowNull: true },
    checkoutDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    status: { type: DataTypes.ENUM('activa', 'cerrada'), allowNull: false, defaultValue: 'activa' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  InventoryCheckout.associate = (models) => {
    InventoryCheckout.belongsTo(models.Project, { foreignKey: 'projectId' });
    InventoryCheckout.belongsTo(models.Employee, { foreignKey: 'responsibleEmployeeId', as: 'responsibleEmployee' });
    InventoryCheckout.belongsTo(models.ThirdParty, { foreignKey: 'responsibleThirdPartyId', as: 'responsibleThirdParty' });
    InventoryCheckout.belongsTo(models.User, { foreignKey: 'authorizedByUserId', as: 'authorizedByUser' });
    InventoryCheckout.hasMany(models.InventoryCheckoutItem, { foreignKey: 'checkoutId', as: 'items', onDelete: 'CASCADE' });
    InventoryCheckout.hasMany(models.InventoryConfirmation, { foreignKey: 'checkoutId', as: 'confirmations', onDelete: 'CASCADE' });
  };

  return InventoryCheckout;
};
