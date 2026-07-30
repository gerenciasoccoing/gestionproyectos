const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseOrder = sequelize.define('PurchaseOrder', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    supplier: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM('abierta', 'parcial', 'cerrada', 'cerrada_con_faltantes'),
      defaultValue: 'abierta',
    },
    closureReason: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  PurchaseOrder.associate = (models) => {
    PurchaseOrder.belongsTo(models.Project, { foreignKey: 'projectId' });
    PurchaseOrder.hasMany(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderId', as: 'items', onDelete: 'CASCADE' });
  };

  return PurchaseOrder;
};
