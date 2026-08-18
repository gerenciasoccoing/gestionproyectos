const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Expense = sequelize.define('Expense', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    // Opcional: un gasto puede registrarse desde la vista general de Gastos sin asociarlo a un
    // proyecto específico (ver expenseController.js, usado tanto por la ruta anidada de proyecto
    // como por la ruta global /expenses).
    projectId: { type: DataTypes.UUID, allowNull: true },
    // Caja de origen: de dónde sale el dinero. Se declara nullable aquí a propósito (para que
    // sync({alter:true}) pueda agregar la columna sin romperse con los gastos ya existentes) pero
    // es obligatoria en la práctica: el controlador la exige siempre al crear, y postSyncFixups
    // hace el backfill de los gastos preexistentes y luego pone el NOT NULL real en la base de
    // datos — ver ese archivo para el detalle de la migración.
    cashBoxId: { type: DataTypes.UUID, allowNull: true },
    // Proveedor registrado (opcional, vínculo a Terceros) para poder filtrar por proveedor real
    // en la vista general. vendorName se mantiene como texto libre (compatibilidad y proveedores
    // no registrados); al elegir un proveedor registrado se autocompleta.
    supplierId: { type: DataTypes.UUID, allowNull: true },
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
    Expense.belongsTo(models.CashBox, { foreignKey: 'cashBoxId' });
    Expense.belongsTo(models.ThirdParty, { foreignKey: 'supplierId', as: 'supplierParty' });
    Expense.hasMany(models.ExpenseItem, { foreignKey: 'expenseId', as: 'items', onDelete: 'CASCADE' });
    Expense.hasMany(models.ExpenseTax, { foreignKey: 'expenseId', as: 'taxes', onDelete: 'CASCADE' });
  };

  return Expense;
};
