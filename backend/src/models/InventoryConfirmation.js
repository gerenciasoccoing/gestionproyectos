const { DataTypes } = require('sequelize');

// Enlace único (token) enviado por WhatsApp junto al reporte de Salida o Entrada, para que la
// persona responsable confirme recepción/devolución con un solo botón, sin iniciar sesión. No
// cambia el estado operativo del equipo/salida (eso ya lo maneja el flujo de checkout/checkin en
// inventoryService); es una capa adicional de trazabilidad: ¿la persona ya vio y confirmó?
// Un token por movimiento específico: uno por salida (kind='salida', checkoutId) y uno por cada
// lote de devolución (kind='entrada', checkoutId + checkinIds del lote que confirma), porque una
// salida puede tener varias devoluciones parciales a lo largo del tiempo, cada una con su propio
// enlace de confirmación.
module.exports = (sequelize) => {
  const InventoryConfirmation = sequelize.define('InventoryConfirmation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    token: { type: DataTypes.STRING, allowNull: false, unique: true },
    kind: { type: DataTypes.ENUM('salida', 'entrada'), allowNull: false },
    checkoutId: { type: DataTypes.UUID, allowNull: false },
    // Solo para kind='entrada': ids de los InventoryCheckin creados en el mismo lote de devolución
    // que este enlace confirma.
    checkinIds: { type: DataTypes.JSON, allowNull: true },
    status: { type: DataTypes.ENUM('pendiente', 'confirmado'), allowNull: false, defaultValue: 'pendiente' },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
  });

  InventoryConfirmation.associate = (models) => {
    InventoryConfirmation.belongsTo(models.InventoryCheckout, { foreignKey: 'checkoutId', as: 'checkout' });
  };

  return InventoryConfirmation;
};
