const { DataTypes } = require('sequelize');

// Usuarios de panel (staff): super_admin (tenantId null, dueño de la plataforma),
// tenant_admin (configura tienda, PT de facturación, ve reportes) y
// tenant_operator (gestiona pedidos, inventario, gastos; sin acceso a configuración sensible).
module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.ENUM('super_admin', 'tenant_admin', 'tenant_operator'),
      allowNull: false,
      defaultValue: 'tenant_operator',
    },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    indexes: [
      { unique: true, fields: ['tenantId', 'email'] },
      // Postgres no considera iguales dos NULL en un índice único normal, así que sin este
      // índice parcial dos super_admin (tenantId null) podrían quedar con el mismo email.
      {
        unique: true,
        fields: ['email'],
        where: { tenantId: null },
        name: 'users_super_admin_email_unique',
      },
    ],
  });

  User.associate = (models) => {
    User.belongsTo(models.Tenant, { foreignKey: 'tenantId' });
  };

  return User;
};
