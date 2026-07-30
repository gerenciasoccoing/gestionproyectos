const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentReceipt = sequelize.define('PaymentReceipt', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    periodLabel: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    filePath: { type: DataTypes.STRING, allowNull: false },
  });

  PaymentReceipt.associate = (models) => {
    PaymentReceipt.belongsTo(models.Employee, { foreignKey: 'employeeId' });
  };

  return PaymentReceipt;
};
