const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Employee = sequelize.define('Employee', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    position: { type: DataTypes.STRING, allowNull: false },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    exitDate: { type: DataTypes.DATEONLY, allowNull: true },
    dedicationHours: { type: DataTypes.DECIMAL(6, 2), allowNull: true, validate: { min: 0 } },
    salaryValue: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    contractFilePath: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('activo', 'retirado'), defaultValue: 'activo' },
  });

  Employee.associate = (models) => {
    Employee.belongsTo(models.Project, { foreignKey: 'projectId' });
    Employee.hasMany(models.SocialSecurityDocument, { foreignKey: 'employeeId', as: 'socialSecurityDocuments' });
    Employee.hasMany(models.PaymentReceipt, { foreignKey: 'employeeId', as: 'paymentReceipts' });
    Employee.hasOne(models.Severance, { foreignKey: 'employeeId', as: 'severance' });
  };

  return Employee;
};
