const { DataTypes } = require('sequelize');

// Estudio de Mercado de Cotizaciones: agrupa varias cotizaciones de distintos proveedores para un
// mismo requerimiento de compra, para compararlas y decidir a quién comprar. Módulo "plus" — solo
// visible/usable si Company.enabledFeatures incluye 'estudio_mercado' (ver
// middleware/authorize.js#requireFeature).
module.exports = (sequelize) => {
  const MarketStudy = sequelize.define('MarketStudy', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: true }, // opcional, igual que Órdenes de Compra
    budgetItemId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional a un ítem de presupuesto/APU
    title: { type: DataTypes.STRING, allowNull: false }, // ej. "Materiales cubierta bloque 3"
    // 'abierta': todavía se están subiendo/revisando cotizaciones. 'decidida': el usuario ya
    // generó el/los borrador(es) de orden de compra — el estudio queda cerrado para nuevas
    // cotizaciones (se puede seguir consultando para auditoría, pero no editando).
    status: { type: DataTypes.ENUM('abierta', 'decidida'), allowNull: false, defaultValue: 'abierta' },
    decisionNotes: { type: DataTypes.TEXT, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  MarketStudy.associate = (models) => {
    MarketStudy.belongsTo(models.Project, { foreignKey: 'projectId' });
    MarketStudy.belongsTo(models.BudgetItem, { foreignKey: 'budgetItemId' });
    MarketStudy.hasMany(models.MarketStudyQuotation, { foreignKey: 'marketStudyId', as: 'quotations', onDelete: 'CASCADE' });
    MarketStudy.hasMany(models.PurchaseOrder, { foreignKey: 'marketStudyId', as: 'draftOrders' });
  };

  return MarketStudy;
};
