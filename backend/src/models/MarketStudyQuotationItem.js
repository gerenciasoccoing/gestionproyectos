const { DataTypes } = require('sequelize');

// Un ítem extraído (o agregado a mano) de una cotización de proveedor. groupKey es la etiqueta de
// comparación: dos ítems de proveedores distintos con el mismo groupKey se muestran en la misma
// fila de la matriz comparativa (ver marketStudyService.js#buildComparison). La IA sugiere un
// groupKey normalizado al extraer, pero es editable por el usuario en la revisión — no hay una
// lista canónica de ítems predefinida, para no forzar al usuario a definir el requerimiento dos
// veces (una al armar el estudio y otra al revisar cada cotización).
module.exports = (sequelize) => {
  const MarketStudyQuotationItem = sequelize.define('MarketStudyQuotationItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    marketStudyQuotationId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.TEXT, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: true },
    quantity: { type: DataTypes.DECIMAL(18, 4), allowNull: true, validate: { min: 0 } },
    unitPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    totalPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    groupKey: { type: DataTypes.STRING, allowNull: false },
    // La IA no pudo extraer este ítem con confianza (precio/cantidad faltante o dudoso): se marca
    // para revisión manual en vez de inventar el dato faltante.
    needsReview: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  });

  MarketStudyQuotationItem.associate = (models) => {
    MarketStudyQuotationItem.belongsTo(models.MarketStudyQuotation, { foreignKey: 'marketStudyQuotationId' });
  };

  return MarketStudyQuotationItem;
};
