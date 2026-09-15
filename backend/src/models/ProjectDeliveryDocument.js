const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProjectDeliveryDocument = sequelize.define('ProjectDeliveryDocument', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    // Categorías fijas de la sección "Entrega Final"; 'otro' habilita el nombre libre en
    // customName. 'factura' admite varios documentos por proyecto igual que las demás categorías
    // (no hay restricción de unicidad) — la sección simplemente lista todos los que haya por tipo.
    category: {
      type: DataTypes.ENUM('factura', 'acta_entrega', 'liquidacion', 'informe_final', 'otro'),
      allowNull: false,
    },
    // Obligatorio solo cuando category = 'otro' (nombre elegido por el usuario para identificar el
    // documento); para las categorías fijas el nombre a mostrar se resuelve por i18n en el
    // frontend a partir de category.
    customName: { type: DataTypes.STRING, allowNull: true },
    filePath: { type: DataTypes.STRING, allowNull: false },
    uploadedBy: { type: DataTypes.UUID, allowNull: true },
  });

  ProjectDeliveryDocument.associate = (models) => {
    ProjectDeliveryDocument.belongsTo(models.Project, { foreignKey: 'projectId' });
    ProjectDeliveryDocument.belongsTo(models.User, { foreignKey: 'uploadedBy', as: 'uploader' });
  };

  return ProjectDeliveryDocument;
};
