const { DataTypes } = require('sequelize');

// Categorías del Catálogo de Materiales, por empresa (ver Material.js#categoryId). "Materiales" es
// la categoría por defecto: se siembra automáticamente para cada empresa (nueva vía
// companyProvisioningService.js, existente vía postSyncFixups.js#seedDefaultMaterialCategoryForExistingCompanies)
// y nunca se puede eliminar (isDefault:true, ver materialCategoryController.js#remove) — es a donde
// cae todo material creado desde una Orden de Compra o importado sin categoría explícita (ver
// la especificación: "En la OC no se crean ni se seleccionan categorías").
module.exports = (sequelize) => {
  const MaterialCategory = sequelize.define('MaterialCategory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    indexes: [{ unique: true, fields: ['companyId', 'name'] }],
  });

  MaterialCategory.associate = (models) => {
    // RESTRICT, no CASCADE: nunca se borra una categoría que todavía tenga materiales (ver
    // materialCategoryController.js#remove, que ya lo valida ANTES a nivel de aplicación con un
    // mensaje claro) — este RESTRICT es solo el cinturón de seguridad a nivel de base de datos.
    MaterialCategory.hasMany(models.Material, { foreignKey: 'categoryId', as: 'materials', onDelete: 'RESTRICT' });
  };

  return MaterialCategory;
};
