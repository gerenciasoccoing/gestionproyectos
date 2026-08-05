const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const APU = sequelize.define('APU', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false },
    // Código de referencia externo (ej. listado oficial de precios unitarios), para poder
    // reimportar/actualizar sin duplicar. Opcional.
    code: { type: DataTypes.STRING, allowNull: true },
    // Costos directos que no corresponden a un insumo con precio propio y reutilizable
    // (ej. "herramienta menor" calculada como % variable de la mano de obra en cada análisis).
    // Se suman al costo directo del APU (que ya no incluye AIU: el AIU se define al crear
    // el presupuesto y se aplica sobre este costo directo, ver Budget.adminPercent/etc).
    otherCosts: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
  });

  APU.associate = (models) => {
    APU.hasMany(models.APUComponent, { foreignKey: 'apuId', as: 'components', onDelete: 'CASCADE' });
    APU.hasMany(models.BudgetItem, { foreignKey: 'apuId' });
  };

  return APU;
};
