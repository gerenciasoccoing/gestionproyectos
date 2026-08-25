const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentReceipt = sequelize.define('PaymentReceipt', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    periodLabel: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    // Antes obligatorio (siempre era un comprobante subido a mano); ahora opcional porque un
    // registro también puede venir de calcular la nómina (ver payrollService.js), que genera su
    // propio PDF (pdfFilePath) en vez de partir de un archivo ya firmado. La opción de adjuntar un
    // comprobante real sigue existiendo tal cual (addPaymentReceipt en employeeController.js).
    filePath: { type: DataTypes.STRING, allowNull: true },
    // --- Cálculo de nómina (ver payrollService.js#calculatePayroll) — todo nullable: un
    // comprobante subido a mano (el flujo que ya existía) no tiene estos datos. ---
    periodStart: { type: DataTypes.DATEONLY, allowNull: true },
    periodEnd: { type: DataTypes.DATEONLY, allowNull: true },
    daysWorked: { type: DataTypes.INTEGER, allowNull: true },
    baseSalary: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    auxTransporte: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    breakdown: { type: DataTypes.JSONB, allowNull: true },
    pdfFilePath: { type: DataTypes.STRING, allowNull: true },
  });

  PaymentReceipt.associate = (models) => {
    PaymentReceipt.belongsTo(models.Employee, { foreignKey: 'employeeId' });
  };

  return PaymentReceipt;
};
