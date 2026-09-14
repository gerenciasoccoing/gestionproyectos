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

    // --- Firma digital por link único (ver contractSignatureService.js) ---
    // 'no_solicitado': nunca se envió a firmar (o el documento no aplica firma, ej. severance no
    // pasa por acá). 'pendiente': se generó un link y está esperando la firma. 'firmado': ya tiene
    // signedPdfFilePath. El link es de un solo uso en el sentido de "una sola firma posible"
    // (signDocument rechaza volver a firmar si ya está 'firmado'), pero el mismo token se conserva
    // después de firmar para que la persona pueda seguir viendo/descargando su copia firmada.
    signatureStatus: { type: DataTypes.ENUM('no_solicitado', 'pendiente', 'firmado'), allowNull: false, defaultValue: 'no_solicitado' },
    // Igual que PasswordResetToken: nunca se guarda el token en claro, solo su hash — se busca por
    // hash cuando alguien abre el link público.
    signatureTokenHash: { type: DataTypes.STRING, allowNull: true },
    signatureTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
    signedAt: { type: DataTypes.DATE, allowNull: true },
    // Trazabilidad mínima para que la firma sea certificable: quién (nombre digitado), desde dónde
    // (IP) y cuándo (signedAt). userAgent es best-effort (puede venir vacío si el navegador no lo
    // manda), nunca bloquea la firma si falta.
    signerIp: { type: DataTypes.STRING, allowNull: true },
    signerUserAgent: { type: DataTypes.STRING, allowNull: true },
    // PDF final CON la firma estampada — se guarda aparte de pdfFilePath (el original sin firmar
    // que se envió a revisar) para no perder ninguna de las dos versiones.
    signedPdfFilePath: { type: DataTypes.STRING, allowNull: true },
  });

  EmployeeContractDocument.associate = (models) => {
    EmployeeContractDocument.belongsTo(models.Employee, { foreignKey: 'employeeId' });
    EmployeeContractDocument.belongsTo(models.EmployeeContractDocument, { foreignKey: 'parentDocumentId', as: 'parentDocument' });
  };

  return EmployeeContractDocument;
};
