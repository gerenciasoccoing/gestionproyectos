const { DataTypes } = require('sequelize');

// Caja de origen de los gastos (efectivo/cuenta desde donde sale el dinero). El saldo NO se
// guarda como columna: se calcula siempre en vivo (inicial + ingresos - gastos con esta caja, ver
// cashBoxService.getBalance) para que nunca pueda desincronizarse — mismo criterio que la
// disponibilidad de Inventario en este proyecto (bajo volumen de movimientos, no se justifica
// cachear). Una caja "cerrada" no puede elegirse como origen de un gasto nuevo, pero conserva su
// historial.
module.exports = (sequelize) => {
  const CashBox = sequelize.define('CashBox', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    initialBalance: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    status: { type: DataTypes.ENUM('activa', 'cerrada'), allowNull: false, defaultValue: 'activa' },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  CashBox.associate = (models) => {
    CashBox.hasMany(models.CashBoxMovement, { foreignKey: 'cashBoxId', as: 'movements', onDelete: 'CASCADE' });
    CashBox.hasMany(models.Expense, { foreignKey: 'cashBoxId', as: 'expenses' });
  };

  return CashBox;
};
