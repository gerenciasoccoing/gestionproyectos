const { DataTypes } = require('sequelize');

// Cliente final de la tienda de un tenant. La cuenta es opcional: el checkout de invitado
// no requiere Customer (los datos del comprador quedan solo en el pedido).
module.exports = (sequelize) => {
  const Customer = sequelize.define('Customer', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING, allowNull: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    indexes: [{ unique: true, fields: ['tenantId', 'email'] }],
  });

  Customer.associate = (models) => {
    Customer.belongsTo(models.Tenant, { foreignKey: 'tenantId' });
    Customer.hasMany(models.Order, { foreignKey: 'customerId' });
  };

  return Customer;
};
