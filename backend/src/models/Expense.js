const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Expense = sequelize.define('Expense', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    category: {
      type: DataTypes.ENUM('mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'),
      allowNull: false,
    },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT },
    // Adjuntos identificados por tipo: la factura (supportFilePath, reutilizado desde la lectura
    // automática) y el comprobante de pago, cada uno con su propio archivo independiente.
    supportFilePath: { type: DataTypes.STRING }, // factura
    paymentReceiptFilePath: { type: DataTypes.STRING, allowNull: true }, // comprobante de pago
    // Datos opcionales extraídos (o digitados) de la factura de soporte.
    vendorName: { type: DataTypes.STRING, allowNull: true },
    vendorNit: { type: DataTypes.STRING, allowNull: true },
    vendorPhone: { type: DataTypes.STRING, allowNull: true },
    vendorEmail: { type: DataTypes.STRING, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    // Suma de los impuestos (ver ExpenseTax para el detalle por impuesto).
    taxAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    source: { type: DataTypes.ENUM('manual', 'purchase_receipt', 'liquidacion', 'purchase_order'), defaultValue: 'manual' },
    sourceId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  Expense.associate = (models) => {
    Expense.belongsTo(models.Project, { foreignKey: 'projectId' });
    Expense.hasMany(models.ExpenseItem, { foreignKey: 'expenseId', as: 'items', onDelete: 'CASCADE' });
    Expense.hasMany(models.ExpenseTax, { foreignKey: 'expenseId', as: 'taxes', onDelete: 'CASCADE' });
  };

  return Expense;
};
