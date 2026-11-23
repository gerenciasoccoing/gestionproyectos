const { DataTypes } = require('sequelize');

// Salida de material (ver materialIssueService.js): al guardarse descuenta de inmediato los lotes
// de origen (PEPS o elegido a mano, mismo mecanismo que MaterialTransfer) y queda
// 'pendiente_firma' — el stock NO vuelve a moverse al firmar (a diferencia de un traslado, acá no
// hay bodega destino): firmar solo certifica la entrega; rechazar devuelve el material a los
// mismos lotes de origen.
module.exports = (sequelize) => {
  const MaterialIssue = sequelize.define('MaterialIssue', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    issueNumber: { type: DataTypes.INTEGER, allowNull: true },
    // Prefijo de 3 dígitos del contrato del proyecto destino (null si "Otro destino" o el proyecto
    // no tiene número de contrato) — mismo criterio que Expense.contractPrefix.
    contractPrefix: { type: DataTypes.STRING(3), allowNull: true },
    fromWarehouseId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    // Destino: un proyecto/contrato activo de la lista, O un texto libre ("Otro destino") — nunca
    // los dos a la vez (validado en el servicio, no acá).
    projectId: { type: DataTypes.UUID, allowNull: true },
    freeTextDestination: { type: DataTypes.STRING, allowNull: true },
    receiverType: { type: DataTypes.ENUM('empleado', 'externo'), allowNull: false },
    receiverEmployeeId: { type: DataTypes.UUID, allowNull: true },
    receiverExternalName: { type: DataTypes.STRING, allowNull: true },
    receiverExternalCedula: { type: DataTypes.STRING, allowNull: true },
    receiverExternalPhone: { type: DataTypes.STRING, allowNull: true },
    receiverExternalEmail: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('pendiente_firma', 'firmado', 'rechazado'), allowNull: false, defaultValue: 'pendiente_firma' },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  MaterialIssue.associate = (models) => {
    MaterialIssue.belongsTo(models.Warehouse, { foreignKey: 'fromWarehouseId', as: 'fromWarehouse' });
    MaterialIssue.belongsTo(models.Project, { foreignKey: 'projectId' });
    MaterialIssue.belongsTo(models.Employee, { foreignKey: 'receiverEmployeeId', as: 'receiverEmployee' });
    MaterialIssue.hasMany(models.MaterialIssueLine, { foreignKey: 'issueId', as: 'lines', onDelete: 'CASCADE' });
    MaterialIssue.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
  };

  return MaterialIssue;
};
