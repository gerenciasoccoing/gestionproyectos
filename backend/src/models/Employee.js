const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Employee = sequelize.define('Employee', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    position: { type: DataTypes.STRING, allowNull: false },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    exitDate: { type: DataTypes.DATEONLY, allowNull: true },
    dedicationHours: { type: DataTypes.DECIMAL(6, 2), allowNull: true, validate: { min: 0 } },
    salaryValue: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    contractFilePath: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('activo', 'retirado'), defaultValue: 'activo' },

    // --- Generación de minutas de contrato (ver contractTemplates.js) ---
    // Todo nullable a propósito: trabajadores creados antes de este cambio quedan con estos
    // campos vacíos y su ficha sigue funcionando igual; solo se exigen (a nivel de controlador,
    // ver contractController.js#assertRequiredFields) al momento de generar un contrato.
    documentType: { type: DataTypes.ENUM('CC', 'CE', 'PASAPORTE', 'PEP'), allowNull: true },
    documentNumber: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    // Determina qué minuta se genera y qué campos son obligatorios (ver CONTRACT_TYPES en
    // contractTemplates.js) — subcontratista_natural/subcontratista_juridica son dos valores
    // distintos en vez de un booleano "esPersonaJuridica" separado, para que el selector del
    // frontend pregunte "natural o jurídica" y ese único campo ya determine todo lo demás.
    contractType: {
      type: DataTypes.ENUM(
        'obra_labor', 'termino_fijo', 'termino_indefinido', 'aprendizaje',
        'prestacion_servicios', 'subcontratista_natural', 'subcontratista_juridica'
      ),
      allowNull: true,
    },
    contractObject: { type: DataTypes.TEXT, allowNull: true },
    // Fecha de terminación DEL CONTRATO (distinta de exitDate, que es cuándo el trabajador
    // realmente se retiró de la empresa — un contrato a término fijo puede vencer y renovarse
    // varias veces sin que exitDate se toque). No aplica a obra_labor/termino_indefinido, donde
    // la terminación no depende de una fecha fija.
    contractEndDate: { type: DataTypes.DATEONLY, allowNull: true },
    epsName: { type: DataTypes.STRING, allowNull: true },
    pensionFundName: { type: DataTypes.STRING, allowNull: true },
    arlName: { type: DataTypes.STRING, allowNull: true },
    cedulaFilePath: { type: DataTypes.STRING, allowNull: true },
    // Solo aplica cuando contractType = 'subcontratista_juridica'.
    subcontractorLegalName: { type: DataTypes.STRING, allowNull: true },
    subcontractorNit: { type: DataTypes.STRING, allowNull: true },
    subcontractorLegalRep: { type: DataTypes.STRING, allowNull: true },
  });

  Employee.associate = (models) => {
    Employee.belongsTo(models.Project, { foreignKey: 'projectId' });
    Employee.hasMany(models.SocialSecurityDocument, { foreignKey: 'employeeId', as: 'socialSecurityDocuments' });
    Employee.hasMany(models.PaymentReceipt, { foreignKey: 'employeeId', as: 'paymentReceipts' });
    Employee.hasOne(models.Severance, { foreignKey: 'employeeId', as: 'severance' });
    Employee.hasMany(models.EmployeeContractDocument, { foreignKey: 'employeeId', as: 'contractDocuments' });
  };

  return Employee;
};
