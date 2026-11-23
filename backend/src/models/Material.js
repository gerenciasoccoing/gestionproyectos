const { DataTypes } = require('sequelize');

// Catálogo liviano de materiales (Inventario de Materiales), por empresa. Se auto-crea por nombre
// al registrar la recepción de un ítem inventariable de una Orden de Compra (ver
// materialService.js#findOrCreateByName, usado desde purchaseOrderController.js#addReceipt) y
// también es editable a mano desde su propia pantalla — sin este catálogo, el kardex y el análisis
// "por material" quedarían fragmentados por cómo cada OC escribió el nombre en PurchaseOrderItem.name
// (texto libre, nunca vinculado a ningún catálogo).
module.exports = (sequelize) => {
  const Material = sequelize.define('Material', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    indexes: [{ unique: true, fields: ['companyId', 'name'] }],
  });

  Material.associate = (models) => {
    // onDelete explícito (RESTRICT): tampoco se expone "eliminar material" en la API (solo
    // activar/desactivar, ver materialController.js) — mismo criterio que Warehouse.js.
    Material.hasMany(models.MaterialLot, { foreignKey: 'materialId', as: 'lots', onDelete: 'RESTRICT' });
  };

  return Material;
};
