const { DataTypes } = require('sequelize');

// Una retención aplicada a un ingreso de caja asociado a un proyecto (ver CashBoxMovement.projectId/
// grossAmount). typeName/recoverable quedan "congelados" (snapshot) al momento de crearla — igual
// que EmployeeContractDocument guarda el objeto/valor vigente al emitir un otrosí — para que
// renombrar un tipo o cambiar su marca "recuperable" desde Administración no altere pagos ya
// registrados. base/percent/value quedan editables en el momento de registrar/editar el pago (ver
// cashBoxMovementService.js): value se sugiere como base*percent/100 pero el usuario puede
// ajustarlo a mano para cuadrar redondeos del certificado del cliente.
module.exports = (sequelize) => {
  const CashBoxMovementWithholding = sequelize.define('CashBoxMovementWithholding', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    cashBoxMovementId: { type: DataTypes.UUID, allowNull: false },
    withholdingTypeId: { type: DataTypes.UUID, allowNull: true },
    typeName: { type: DataTypes.STRING, allowNull: false },
    base: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    percent: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } },
    value: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    recoverable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Solo tiene sentido cuando recoverable=true: si el cliente ya devolvió esta retención
    // (ej. al liquidar el contrato), returned queda en true y returnMovementId apunta al
    // CashBoxMovement (isWithholdingReturn=true) que registró esa devolución — ver
    // cashBoxMovementService.js#registerWithholdingReturn.
    returned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    returnMovementId: { type: DataTypes.UUID, allowNull: true },
  });

  CashBoxMovementWithholding.associate = (models) => {
    CashBoxMovementWithholding.belongsTo(models.CashBoxMovement, { foreignKey: 'cashBoxMovementId', as: 'movement' });
    CashBoxMovementWithholding.belongsTo(models.WithholdingType, { foreignKey: 'withholdingTypeId' });
  };

  return CashBoxMovementWithholding;
};
