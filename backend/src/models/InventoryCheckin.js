const { DataTypes } = require('sequelize');

// Un evento de devolución contra una línea de salida (InventoryCheckoutItem). Puede haber varios
// eventos por línea (devoluciones parciales en distintos momentos). `resultingStatus` es la
// decisión de quien recibe sobre en qué estado queda el equipo tras ESTA devolución.
module.exports = (sequelize) => {
  const InventoryCheckin = sequelize.define('InventoryCheckin', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    checkoutItemId: { type: DataTypes.UUID, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0.0001 } },
    condition: { type: DataTypes.ENUM('bueno', 'dañado', 'incompleto'), allowNull: false },
    resultingStatus: { type: DataTypes.ENUM('disponible', 'mantenimiento', 'baja'), allowNull: false },
    receivedByUserId: { type: DataTypes.UUID, allowNull: true },
    checkinDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  InventoryCheckin.associate = (models) => {
    InventoryCheckin.belongsTo(models.InventoryCheckoutItem, { foreignKey: 'checkoutItemId', as: 'checkoutItem' });
    InventoryCheckin.belongsTo(models.User, { foreignKey: 'receivedByUserId', as: 'receivedByUser' });
  };

  return InventoryCheckin;
};
