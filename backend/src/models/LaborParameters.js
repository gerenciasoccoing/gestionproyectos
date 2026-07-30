const { DataTypes } = require('sequelize');

// Parámetros legales colombianos, versionados por fecha de vigencia (cambian cada año/reforma).
module.exports = (sequelize) => {
  const LaborParameters = sequelize.define('LaborParameters', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    smlv: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } }, // salario mínimo legal vigente
    auxTransporte: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    cesantiasDivisor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 360 },
    interesesCesantiasPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 12 },
    primaDivisor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 360 },
    vacacionesDivisor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 720 },
    topeAuxTransporteSalarios: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 2 }, // salarios <= 2 SMLV reciben aux. transporte
    notes: { type: DataTypes.TEXT },
  });

  return LaborParameters;
};
