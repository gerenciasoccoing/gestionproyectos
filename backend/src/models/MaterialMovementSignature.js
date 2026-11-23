const { DataTypes } = require('sequelize');

// Firma por link de un movimiento del Inventario de Materiales (traslado/salida/devolución) — mismo
// mecanismo (token hasheado, canvas, certificado de IP/hora/dispositivo) que VoucherSignature para
// comprobantes de Gastos/Cajas, en su propia tabla (ver materialSignatureService.js): acá cada
// movimiento tiene UN solo firmante (quien recibe el traslado, quien recibe el material, o quien
// devuelve), a diferencia de los comprobantes que firman varios roles — así que no hace falta la
// columna `role` ni la unicidad compuesta de VoucherSignature, un registro por movimiento alcanza.
module.exports = (sequelize) => {
  const MaterialMovementSignature = sequelize.define('MaterialMovementSignature', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    movementType: { type: DataTypes.ENUM('traslado', 'salida', 'devolucion'), allowNull: false },
    movementId: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.ENUM('pendiente', 'firmado', 'rechazado'), allowNull: false, defaultValue: 'pendiente' },
    signerName: { type: DataTypes.STRING, allowNull: true },
    signatureTokenHash: { type: DataTypes.STRING, allowNull: true },
    signatureTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
    signaturePath: { type: DataTypes.STRING, allowNull: true },
    signedAt: { type: DataTypes.DATE, allowNull: true },
    rejectedAt: { type: DataTypes.DATE, allowNull: true },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    signerIp: { type: DataTypes.STRING, allowNull: true },
    signerUserAgent: { type: DataTypes.STRING, allowNull: true },
    // Quién firmó desde dentro de la app (sesión autenticada) — null si se firmó por enlace público.
    signedByUserId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  }, {
    indexes: [{ unique: true, fields: ['movementType', 'movementId'] }],
  });

  return MaterialMovementSignature;
};
