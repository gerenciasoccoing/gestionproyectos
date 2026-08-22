const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Product = sequelize.define('Product', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    categoryId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    sku: { type: DataTypes.STRING, allowNull: true },
    price: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    images: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },

    // Inventario
    trackInventory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lowStockThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  }, {
    indexes: [{ unique: true, fields: ['tenantId', 'slug'] }],
  });

  Product.associate = (models) => {
    Product.belongsTo(models.Tenant, { foreignKey: 'tenantId' });
    Product.belongsTo(models.Category, { foreignKey: 'categoryId' });
    Product.hasMany(models.InventoryMovement, { foreignKey: 'productId' });
    Product.hasMany(models.OrderItem, { foreignKey: 'productId' });
  };

  return Product;
};
