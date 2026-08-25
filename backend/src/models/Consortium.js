const { DataTypes } = require('sequelize');

// Consorcio o Unión Temporal: entidad contratante alterna a la empresa principal (Company), que
// puede asignarse a un Project (ver Project.consortiumId) para que todos los documentos generados
// dentro de ese proyecto (órdenes de compra, contratos/nómina/liquidación de personal,
// cotizaciones/presupuestos, informes) usen su membrete en vez del de la empresa principal — ver
// services/letterheadService.js#getLetterheadForProject.
module.exports = (sequelize) => {
  const Consortium = sequelize.define('Consortium', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    nit: { type: DataTypes.STRING },
    address: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    // Quien firma como "EL EMPLEADOR"/"Autorizó" en los documentos de proyectos asignados a este
    // consorcio — mismo rol que Company.managerName para la empresa principal.
    legalRepName: { type: DataTypes.STRING, allowNull: true },
    logoPath: { type: DataTypes.STRING, allowNull: true },
  });

  Consortium.associate = (models) => {
    Consortium.hasMany(models.Project, { foreignKey: 'consortiumId', as: 'projects' });
  };

  return Consortium;
};
