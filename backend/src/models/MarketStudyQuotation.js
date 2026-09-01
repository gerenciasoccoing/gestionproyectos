const { DataTypes } = require('sequelize');

// Una cotización subida por el usuario para un Estudio de Mercado (una fila por proveedor). El
// archivo se persiste (ver middleware/upload.js) para trazabilidad/auditoría, no solo se lee y
// descarta como en el escaneo de contratos.
module.exports = (sequelize) => {
  const MarketStudyQuotation = sequelize.define('MarketStudyQuotation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    marketStudyId: { type: DataTypes.UUID, allowNull: false },
    supplierId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional a Terceros (proveedor)
    // Nombre del proveedor tal como viene en la cotización, incluso si no se vinculó (o no existe
    // todavía) un Tercero — así la matriz comparativa siempre tiene qué mostrar.
    supplierNameRaw: { type: DataTypes.STRING, allowNull: false },
    filePath: { type: DataTypes.STRING, allowNull: true },
    // Texto libre a propósito: los proveedores expresan el tiempo de entrega de formas muy
    // distintas ("15 días hábiles", "2 semanas", "inmediato") — forzar un número/unidad fija
    // perdería información en vez de normalizarla de forma confiable.
    deliveryTime: { type: DataTypes.STRING, allowNull: true },
    validUntil: { type: DataTypes.DATEONLY, allowNull: true },
    paymentTerms: { type: DataTypes.TEXT, allowNull: true },
    // 'revisar': la IA no logró extraer con confianza uno o más campos de esta cotización (o de
    // sus ítems) y el usuario todavía no la revisó a mano.
    extractionStatus: { type: DataTypes.ENUM('ok', 'revisar'), allowNull: false, defaultValue: 'ok' },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  MarketStudyQuotation.associate = (models) => {
    MarketStudyQuotation.belongsTo(models.MarketStudy, { foreignKey: 'marketStudyId' });
    MarketStudyQuotation.belongsTo(models.ThirdParty, { foreignKey: 'supplierId', as: 'supplierParty' });
    MarketStudyQuotation.hasMany(models.MarketStudyQuotationItem, { foreignKey: 'marketStudyQuotationId', as: 'items', onDelete: 'CASCADE' });
  };

  return MarketStudyQuotation;
};
