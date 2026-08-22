const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Category = sequelize.define('Category', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    indexes: [{ unique: true, fields: ['tenantId', 'slug'] }],
  });

  Category.associate = (models) => {
    Category.belongsTo(models.Tenant, { foreignKey: 'tenantId' });
    Category.hasMany(models.Product, { foreignKey: 'categoryId' });
  };

  return Category;
};
