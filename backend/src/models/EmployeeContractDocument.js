const { DataTypes } = require('sequelize');

// Historial de contratos y otrosíes generados para un trabajador (ver contractController.js).
// Cada fila es un documento real generado (no una plantilla): guarda el snapshot de los datos con
// los que se generó (valueAtIssue/objectAtIssue/effectiveFrom/effectiveTo) además de la ruta de
// los archivos PDF/Word, para que el historial siga siendo legible aunque después se edite la
// ficha del trabajador. Un otrosí referencia (parentDocumentId) el contrato o el otrosí anterior
// que modifica, formando una cadena — así "el último documento vigente" siempre se puede resolver
// siguiendo esa cadena, sin depender de que el otrosí repita todo lo que no cambió.
module.exports = (sequelize) => {
  const EmployeeContractDocument = sequelize.define('EmployeeContractDocument', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    parentDocumentId: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.ENUM('contrato', 'otrosi'), allowNull: false },
    // Copia de Employee.contractType al momento de emitirse (un otrosí de un contrato por obra o
    // labor siempre hereda este mismo valor; queda igual aquí para no tener que ir a buscarlo al
    // padre cada vez que se lista el historial).
    contractType: { type: DataTypes.STRING, allowNull: false },
    sequenceNumber: { type: DataTypes.INTEGER, allowNull: false }, // No. de otrosí dentro de la cadena del trabajador (0 = contrato inicial)
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: true },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    valueAtIssue: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    objectAtIssue: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    generatedBy: { type: DataTypes.UUID, allowNull: true }, // userId de quien lo generó
    pdfFilePath: { type: DataTypes.STRING, allowNull: true },
    docxFilePath: { type: DataTypes.STRING, allowNull: true },
    // Prefijo de 3 dígitos tomado de Project.contractNumber AL MOMENTO DE GENERARSE este documento
    // (ver numberingService.js) — null si el proyecto no tenía número de contrato asignado en ese
    // momento. No se recalcula si el número del proyecto cambia después.
    contractPrefix: { type: DataTypes.STRING(3), allowNull: true },
  });

  EmployeeContractDocument.associate = (models) => {
    EmployeeContractDocument.belongsTo(models.Employee, { foreignKey: 'employeeId' });
    EmployeeContractDocument.belongsTo(models.EmployeeContractDocument, { foreignKey: 'parentDocumentId', as: 'parentDocument' });
  };

  return EmployeeContractDocument;
};
