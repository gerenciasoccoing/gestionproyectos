const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Severance = sequelize.define('Severance', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: false, unique: true },
    exitDate: { type: DataTypes.DATEONLY, allowNull: false },
    cause: {
      type: DataTypes.ENUM('renuncia', 'justa_causa', 'sin_justa_causa', 'terminacion_termino'),
      allowNull: false,
    },
    laborParametersId: { type: DataTypes.UUID, allowNull: false },
    daysWorked: { type: DataTypes.INTEGER, allowNull: false },
    cesantias: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    interesesCesantias: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    prima: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    vacaciones: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    indemnizacion: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    breakdown: { type: DataTypes.JSONB, allowNull: false }, // detalle auditable por concepto (fórmula + valores)
    pazYSalvoFilePath: { type: DataTypes.STRING, allowNull: true },
    expenseId: { type: DataTypes.UUID, allowNull: true },
  });

  Severance.associate = (models) => {
    Severance.belongsTo(models.Employee, { foreignKey: 'employeeId' });
    Severance.belongsTo(models.LaborParameters, { foreignKey: 'laborParametersId' });
    Severance.belongsTo(models.Expense, { foreignKey: 'expenseId' });
  };

  return Severance;
};
