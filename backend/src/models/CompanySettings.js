const { DataTypes } = require('sequelize');

// Configuración global de la empresa (singleton) usada para el branding del PDF de cotización.
module.exports = (sequelize) => {
  const CompanySettings = sequelize.define('CompanySettings', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyName: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Mi Empresa' },
    logoPath: { type: DataTypes.STRING, allowNull: true },
    nit: { type: DataTypes.STRING },
    address: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    // Factor prestacional (%) sugerido por defecto al agregar mano de obra a un APU.
    // Editable por ítem al momento de seleccionar el insumo de personal.
    defaultPrestacionalPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 70 },
  });

  return CompanySettings;
};
