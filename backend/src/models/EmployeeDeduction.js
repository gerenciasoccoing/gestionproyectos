const { DataTypes } = require('sequelize');

// Otros descuentos de nómina (préstamos/anticipos, libranzas, embargos judiciales y otros
// descuentos autorizados) — ver laborCalculations.js#computeOtherDeductions para cómo se aplican
// sobre un período. Cada fila es una cuota periódica que se sigue aplicando automáticamente
// mientras esté activa y tenga saldo, no un descuento suelto de una sola vez (eso se registra
// directamente como una línea de retención en la fuente, ver payrollService.js#retefuente).
module.exports = (sequelize) => {
  const EmployeeDeduction = sequelize.define('EmployeeDeduction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('prestamo', 'libranza', 'embargo', 'otro'), allowNull: false },
    concept: { type: DataTypes.STRING, allowNull: false },
    // Solo para type='embargo': determina el tope legal aplicable (CST art. 154-155) — ver
    // laborCalculations.js#embargoLegalCap. 'alimentos' (cuota alimentaria) hasta el 50% del
    // salario; 'ordinario' (cualquier otra deuda) hasta 1/5 del exceso sobre 1 SMMLV.
    embargoKind: { type: DataTypes.ENUM('ordinario', 'alimentos'), allowNull: true },
    // Monto total de la deuda/orden (null = indefinido, típico de un embargo sin tope de monto
    // conocido). Si viene, balance arranca igual a este valor y se decrementa cuota a cuota.
    totalAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    installmentAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    // null = sin saldo que llevar (se aplica indefinidamente hasta desactivarla a mano). Al
    // confirmar una nómina que la aplicó, se decrementa por el monto realmente aplicado (ver
    // payrollController.js#confirm) y, al llegar a 0, se desactiva sola.
    balance: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    // Autorización escrita del trabajador (préstamo/libranza/otro) u orden judicial (embargo).
    authorizationFilePath: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  EmployeeDeduction.associate = (models) => {
    EmployeeDeduction.belongsTo(models.Employee, { foreignKey: 'employeeId' });
  };

  return EmployeeDeduction;
};
