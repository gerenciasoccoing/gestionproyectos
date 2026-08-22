const { DataTypes } = require('sequelize');

// Historial de movimientos de stock: entrada (compra/ajuste positivo), salida (venta/ajuste
// negativo) y ajuste (corrección manual). Queda trazado quién y por qué lo hizo.
module.exports = (sequelize) => {
  const InventoryMovement = sequelize.define('InventoryMovement', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    productId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('in', 'out', 'adjustment'), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    previousStock: { type: DataTypes.INTEGER, allowNull: false },
    newStock: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING, allowNull: true },
    orderId: { type: DataTypes.UUID, allowNull: true },
    userId: { type: DataTypes.UUID, allowNull: true },
  });

  InventoryMovement.associate = (models) => {
    InventoryMovement.belongsTo(models.Tenant, { foreignKey: 'tenantId' });
    InventoryMovement.belongsTo(models.Product, { foreignKey: 'productId' });
    InventoryMovement.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return InventoryMovement;
};
