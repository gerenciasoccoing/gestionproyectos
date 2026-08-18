const { DataTypes } = require('sequelize');

// Sección del APU a la que pertenece el componente; determina qué fórmula de costo se aplica.
const CATEGORIES = ['material', 'herramienta', 'personal', 'transporte'];
// Modalidad de cálculo de un componente de transporte.
const TRANSPORT_MODES = ['distancia_peso', 'porcentaje_materiales'];

module.exports = (sequelize) => {
  const APUComponent = sequelize.define('APUComponent', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    apuId: { type: DataTypes.UUID, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false, defaultValue: 'material', validate: { isIn: [CATEGORIES] } },
    // Insumo de la base de precios. Obligatorio salvo en transporte, donde puede ser una tarifa manual.
    priceItemId: { type: DataTypes.UUID, allowNull: true },
    // Etiqueta manual (ej. "Motocarro") cuando el componente de transporte no referencia un insumo.
    description: { type: DataTypes.STRING, allowNull: true },
    // Cantidad: unidades de material/herramienta/personal, o peso en kg para transporte por distancia.
    quantity: { type: DataTypes.DECIMAL(18, 6), allowNull: false, defaultValue: 1, validate: { min: 0 } },
    // Rendimiento: multiplica en herramientas, divide en personal. No aplica a material/transporte.
    yield: { type: DataTypes.DECIMAL(18, 6), allowNull: true, defaultValue: 1, validate: { min: 0 } },
    // Valor unitario manual (ej. tarifa $/kg-km de transporte) cuando no hay priceItemId.
    unitValue: { type: DataTypes.DECIMAL(18, 2), allowNull: true, validate: { min: 0 } },
    // Factor prestacional (%) aplicado sobre el valor base de personal: valor real = base + base*%.
    prestacionalPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: true, defaultValue: 0, validate: { min: 0 } },
    // % de desperdicio (solo material): cantidad efectiva = quantity * (1 + wastePercent/100).
    wastePercent: { type: DataTypes.DECIMAL(6, 2), allowNull: true, defaultValue: 0, validate: { min: 0 } },
    transportMode: { type: DataTypes.STRING, allowNull: true, validate: { isIn: [TRANSPORT_MODES] } },
    transportDistance: { type: DataTypes.DECIMAL(18, 6), allowNull: true, validate: { min: 0 } },
    transportPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: true, validate: { min: 0 } },
  });

  APUComponent.CATEGORIES = CATEGORIES;
  APUComponent.TRANSPORT_MODES = TRANSPORT_MODES;

  APUComponent.associate = (models) => {
    APUComponent.belongsTo(models.APU, { foreignKey: 'apuId' });
    APUComponent.belongsTo(models.PriceItem, { foreignKey: 'priceItemId', as: 'priceItem' });
  };

  return APUComponent;
};
