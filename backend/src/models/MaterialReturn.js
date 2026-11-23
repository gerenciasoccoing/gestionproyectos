const { DataTypes } = require('sequelize');

// Devolución de material sobrante de un contrato (ver materialReturnService.js) — siempre se
// registra contra líneas concretas de una o varias Salidas ya firmadas (MaterialIssueLine, ver
// MaterialReturnLine), nunca "a ciegas": así "no se puede devolver más de lo entregado menos lo ya
// devuelto" se puede comprobar exactamente. Acredita el stock DE INMEDIATO al registrarse (no hay
// estado "en tránsito" como en un traslado: el material físicamente ya está de vuelta en la bodega
// elegida) — firmar solo certifica quién hizo la devolución.
module.exports = (sequelize) => {
  const MaterialReturn = sequelize.define('MaterialReturn', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    returnNumber: { type: DataTypes.INTEGER, allowNull: true },
    contractPrefix: { type: DataTypes.STRING(3), allowNull: true },
    toWarehouseId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    // Denormalizado desde las salidas de origen de sus líneas (todas deben pertenecer al mismo
    // proyecto — ver materialReturnService.js) — solo para mostrar/filtrar sin tener que unir.
    projectId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM('pendiente_firma', 'firmado', 'rechazado'), allowNull: false, defaultValue: 'pendiente_firma' },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  MaterialReturn.associate = (models) => {
    MaterialReturn.belongsTo(models.Warehouse, { foreignKey: 'toWarehouseId', as: 'toWarehouse' });
    MaterialReturn.belongsTo(models.Project, { foreignKey: 'projectId' });
    MaterialReturn.hasMany(models.MaterialReturnLine, { foreignKey: 'returnId', as: 'lines', onDelete: 'CASCADE' });
    MaterialReturn.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
  };

  return MaterialReturn;
};
