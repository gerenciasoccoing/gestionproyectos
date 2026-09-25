const { DataTypes } = require('sequelize');

// Catálogo de tipos de retención por empresa (Administración > Parámetros > Retenciones), usado al
// registrar un pago a caja asociado a un proyecto (ver CashBoxMovementWithholding). Nunca se
// elimina un tipo ya usado en un pago — solo se desactiva (active=false, sigue existiendo para no
// romper el historial de pagos que ya lo referencian, simplemente deja de ofrecerse al agregar una
// retención nueva). recoverable marca los tipos que el cliente devuelve más adelante (ej.
// Retención de garantía) — controla si el pago que la genera cuenta como "retención pendiente de
// recuperar" en el resumen de Pagos al proyecto.
module.exports = (sequelize) => {
  const WithholdingType = sequelize.define('WithholdingType', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    defaultPercent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } },
    recoverable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  WithholdingType.associate = (models) => {
    WithholdingType.hasMany(models.CashBoxMovementWithholding, { foreignKey: 'withholdingTypeId' });
  };

  return WithholdingType;
};
