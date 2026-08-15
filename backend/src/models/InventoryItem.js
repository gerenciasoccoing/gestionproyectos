const { DataTypes } = require('sequelize');

// Catálogo de equipos/herramientas, global a la empresa (no por proyecto), igual que Terceros o
// la Base de Precios. Dos formas de seguimiento:
//  - "serializado": una fila = una unidad física única (ej. una taladradora con su propio código);
//    `status` refleja su situación real en todo momento.
//  - "cantidad": una fila = un tipo de herramienta que se maneja por stock (ej. "50 llaves de
//    tubo"), sin unidades individualizadas. La disponibilidad se calcula (ver inventoryService.
//    computeAvailableQuantity) restando a `stockQuantity` lo reservado en salidas activas más
//    `maintenanceQuantity`/`retiredQuantity`; `status` no se usa para decidir disponibilidad en
//    este modo, solo como bandera manual (ej. descontinuar el ítem completo).
module.exports = (sequelize) => {
  const InventoryItem = sequelize.define('InventoryItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    category: { type: DataTypes.STRING, allowNull: false },
    trackingType: { type: DataTypes.ENUM('serializado', 'cantidad'), allowNull: false, defaultValue: 'serializado' },
    status: { type: DataTypes.ENUM('disponible', 'en_prestamo', 'mantenimiento', 'baja'), allowNull: false, defaultValue: 'disponible' },
    photoPath: { type: DataTypes.STRING, allowNull: true },
    value: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    // Solo aplican con trackingType = 'cantidad'.
    stockQuantity: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    maintenanceQuantity: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    retiredQuantity: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  InventoryItem.associate = (models) => {
    InventoryItem.hasMany(models.InventoryCheckoutItem, { foreignKey: 'inventoryItemId', as: 'checkoutItems' });
  };

  return InventoryItem;
};
