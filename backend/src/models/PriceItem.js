const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PriceItem = sequelize.define('PriceItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.ENUM('material', 'mano_obra', 'equipo'), allowNull: false },
    // Código de referencia externo (ej. listado oficial de precios unitarios). Opcional, pero si
    // se informa se usa como criterio principal de coincidencia al reimportar/actualizar.
    code: { type: DataTypes.STRING, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false },
    currentValue: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
  });

  PriceItem.associate = (models) => {
    PriceItem.hasMany(models.PriceHistory, { foreignKey: 'priceItemId', as: 'history' });
    PriceItem.hasMany(models.APUComponent, { foreignKey: 'priceItemId' });
  };

  return PriceItem;
};
