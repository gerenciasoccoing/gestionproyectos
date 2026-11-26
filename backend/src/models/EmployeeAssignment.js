const { DataTypes } = require('sequelize');

// Relación muchos a muchos trabajador↔contrato/proyecto (ver la especificación: "Crea una relación
// muchos a muchos trabajador ↔ contrato/proyecto"). Reemplaza a Employee.projectId como fuente de
// verdad de "a qué contratos está asignado" — ese campo se mantiene (ver Employee.js) solo como la
// asignación PRINCIPAL/actual para no tener que tocar los generadores de contrato laboral, nómina y
// liquidación, que siguen leyendo únicamente employeeId (nunca esta tabla).
//
// Un trabajador "Administrativo" (Employee.projectId null) puede tener asignaciones igual que uno
// "De proyecto" — la especificación es explícita: "puede asignarse a uno o varios contratos sin
// perder esa condición". No hay ninguna restricción de unicidad (companyId, employeeId, projectId):
// un mismo trabajador puede volver a asignarse al mismo contrato más adelante (una asignación
// finalizada y una nueva abierta después), así que se deja a la lógica de negocio (ver
// employeeAssignmentController.js) impedir dos asignaciones ACTIVAS simultáneas al mismo contrato,
// en vez de una constraint de base de datos que lo bloquearía para siempre.
module.exports = (sequelize) => {
  const EmployeeAssignment = sequelize.define('EmployeeAssignment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    // Cargo EN ESE contrato — puede diferir del Employee.position general (un trabajador puede
    // desempeñar un rol distinto según el contrato); position sigue siendo el cargo "de base".
    position: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('activo', 'finalizado'), allowNull: false, defaultValue: 'activo' },
    observations: { type: DataTypes.TEXT, allowNull: true },
  }, {
    indexes: [
      { fields: ['companyId', 'employeeId'] },
      { fields: ['companyId', 'projectId'] },
    ],
  });

  EmployeeAssignment.associate = (models) => {
    EmployeeAssignment.belongsTo(models.Employee, { foreignKey: 'employeeId' });
    EmployeeAssignment.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return EmployeeAssignment;
};
