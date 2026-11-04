const { DataTypes } = require('sequelize');

// Firma digital de un comprobante de egreso/ingreso (ver voucherSignatureService.js), por rol
// ("Elaboró"/"Aprobó"/"Recibí conforme" en egresos; "Entregó"/"Recibió" en ingresos). voucherId es
// polimórfico (Expense.id o CashBoxMovement.id según voucherType) a propósito: egresos e ingresos
// comparten exactamente el mismo mecanismo de firma, así que una sola tabla evita duplicarlo — el
// comprobante en sí se sigue generando en vivo (ver pdfService.js), nunca se persiste un PDF; lo
// único que se persiste acá es la imagen de la firma (PNG) para poder dibujarla en cada generación.
module.exports = (sequelize) => {
  const VoucherSignature = sequelize.define('VoucherSignature', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    voucherType: { type: DataTypes.ENUM('gasto', 'ingreso'), allowNull: false },
    voucherId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.ENUM('pendiente', 'firmado'), allowNull: false, defaultValue: 'pendiente' },
    signerName: { type: DataTypes.STRING, allowNull: true },
    // Mismo criterio que PasswordResetToken/EmployeeContractDocument: nunca se guarda el token en
    // claro, solo su hash — usado únicamente cuando la firma se solicita por enlace público
    // (voucherSignatureService.js#requestExternalSignature). Si se firma dentro de la app
    // (usuario ya autenticado) estos quedan null.
    signatureTokenHash: { type: DataTypes.STRING, allowNull: true },
    signatureTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
    // Imagen de la firma dibujada (PNG), guardada vía saveGeneratedFile — igual convención de
    // archivos que el resto de la app.
    signaturePath: { type: DataTypes.STRING, allowNull: true },
    signedAt: { type: DataTypes.DATE, allowNull: true },
    signerIp: { type: DataTypes.STRING, allowNull: true },
    signerUserAgent: { type: DataTypes.STRING, allowNull: true },
    // Quién firmó desde dentro de la app (sesión autenticada) — null si se firmó por enlace público.
    signedByUserId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  }, {
    indexes: [{ unique: true, fields: ['voucherType', 'voucherId', 'role'] }],
  });

  return VoucherSignature;
};
