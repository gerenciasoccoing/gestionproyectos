const { DataTypes } = require('sequelize');

// Bodega de materiales (Inventario de Materiales — no confundir con Equipos y Herramientas, que no
// usa bodegas). Cada empresa tiene una "Bodega Principal" (isDefault) creada automáticamente al
// aprovisionar la empresa (ver companyProvisioningService.js) y para las empresas ya existentes
// (ver postSyncFixups.js) — no se puede eliminar.
//
// El responsable puede ser un usuario de la plataforma (managerUserId, confirma traslados logueado
// si tiene el permiso) y/o un contacto sin cuenta (managerName/Phone/Email, para el enlace de firma
// por WhatsApp/correo) — las dos vías que permite confirmar un traslado, ver materialTransferService.js.
module.exports = (sequelize) => {
  const Warehouse = sequelize.define('Warehouse', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    location: { type: DataTypes.STRING, allowNull: true },
    managerUserId: { type: DataTypes.UUID, allowNull: true },
    managerName: { type: DataTypes.STRING, allowNull: true },
    managerPhone: { type: DataTypes.STRING, allowNull: true },
    managerEmail: { type: DataTypes.STRING, allowNull: true },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

  Warehouse.associate = (models) => {
    Warehouse.belongsTo(models.User, { foreignKey: 'managerUserId', as: 'manager' });
    // onDelete explícito (RESTRICT, no el CASCADE que Sequelize pondría por defecto en un FK NOT
    // NULL): no exponemos ningún "eliminar bodega" en la API (ver warehouseController.js — solo
    // activar/desactivar), pero si algún día se agregara, un lote con historial jamás debe poder
    // desaparecer en cascada por accidente.
    Warehouse.hasMany(models.MaterialLot, { foreignKey: 'warehouseId', as: 'lots', onDelete: 'RESTRICT' });
  };

  return Warehouse;
};
