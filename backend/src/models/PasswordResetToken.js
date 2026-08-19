const { DataTypes } = require('sequelize');

// Token de un solo uso para restablecer contraseña (o para que el primer admin de una empresa
// recién aprobada defina la suya). Excluido del aislamiento multi-tenant a propósito (ver
// defineModels.js#TENANT_SCOPING_EXCLUDED): se crea y se consulta desde endpoints públicos (sin
// sesión) donde todavía no hay companyId en contexto — igual que InventoryConfirmation, siempre se
// opera sobre este modelo con la conexión de administración (bypasea RLS, que de todos modos no
// tendría GUC que aplicar acá). Solo se guarda el hash del token, nunca el valor en claro (mismo
// criterio que las contraseñas).
module.exports = (sequelize) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
  }, { updatedAt: false });

  PasswordResetToken.associate = (models) => {
    PasswordResetToken.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return PasswordResetToken;
};
