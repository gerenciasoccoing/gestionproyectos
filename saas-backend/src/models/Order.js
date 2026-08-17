const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Order = sequelize.define('Order', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenantId: { type: DataTypes.UUID, allowNull: false },
    customerId: { type: DataTypes.UUID, allowNull: true },
    orderNumber: { type: DataTypes.STRING, allowNull: false },

    customerName: { type: DataTypes.STRING, allowNull: false },
    customerEmail: { type: DataTypes.STRING, allowNull: false },
    customerPhone: { type: DataTypes.STRING, allowNull: true },
    shippingAddress: { type: DataTypes.STRING, allowNull: true },

    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    shippingCost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

    // pending_payment: recién creada, esperando confirmación de la pasarela.
    // paid: pago confirmado (dispara descuento de inventario y, en fases posteriores, facturación).
    // failed / cancelled: no se concretó. fulfilled: despachada por el tenant.
    status: {
      type: DataTypes.ENUM('pending_payment', 'paid', 'failed', 'cancelled', 'fulfilled'),
      allowNull: false,
      defaultValue: 'pending_payment',
    },
    stockDeducted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    paymentProvider: { type: DataTypes.STRING, allowNull: true },
    paymentReference: { type: DataTypes.STRING, allowNull: true },
    paymentTransactionId: { type: DataTypes.STRING, allowNull: true },
    paymentStatus: { type: DataTypes.STRING, allowNull: true },
  }, {
    indexes: [{ unique: true, fields: ['tenantId', 'orderNumber'] }, { fields: ['paymentReference'] }],
  });

  Order.associate = (models) => {
    Order.belongsTo(models.Tenant, { foreignKey: 'tenantId' });
    Order.belongsTo(models.Customer, { foreignKey: 'customerId' });
    Order.hasMany(models.OrderItem, { foreignKey: 'orderId' });
  };

  return Order;
};
