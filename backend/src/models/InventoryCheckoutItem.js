const { DataTypes } = require('sequelize');

// Una línea = un equipo (o cantidad de un equipo tipo "cantidad") dentro de una salida.
// Pendiente por resolver = quantity - returnedQuantity - justifiedMissingQuantity; la línea (y la
// salida completa, cuando todas sus líneas llegan a 0) se considera cerrada cuando ese pendiente
// llega a 0. Para ítems "serializado", quantity siempre es 1.
module.exports = (sequelize) => {
  const InventoryCheckoutItem = sequelize.define('InventoryCheckoutItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    checkoutId: { type: DataTypes.UUID, allowNull: false },
    inventoryItemId: { type: DataTypes.UUID, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 1, validate: { min: 0.0001 } },
    returnedQuantity: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    // Cantidad de esta línea que se da por perdida/no devuelta con justificación, sin devolución
    // física (ver inventoryService.justifyMissing) — permite cerrar la salida sin que todo vuelva.
    justifiedMissingQuantity: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    justificationNote: { type: DataTypes.TEXT, allowNull: true },
  });

  InventoryCheckoutItem.associate = (models) => {
    InventoryCheckoutItem.belongsTo(models.InventoryCheckout, { foreignKey: 'checkoutId', as: 'checkout' });
    InventoryCheckoutItem.belongsTo(models.InventoryItem, { foreignKey: 'inventoryItemId' });
    InventoryCheckoutItem.hasMany(models.InventoryCheckin, { foreignKey: 'checkoutItemId', as: 'checkins', onDelete: 'CASCADE' });
  };

  return InventoryCheckoutItem;
};
