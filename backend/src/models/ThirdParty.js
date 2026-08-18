const { DataTypes } = require('sequelize');

// Terceros: Proveedores y Clientes, como catálogo único de la empresa (no por proyecto), igual
// que la base de precios o el catálogo de APU. "type" discrimina el uso; los campos son los
// mismos para ambos salvo la certificación bancaria, que solo aplica a proveedores.
module.exports = (sequelize) => {
  const ThirdParty = sequelize.define('ThirdParty', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.ENUM('proveedor', 'cliente'), allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false }, // razón social / nombre
    nit: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    contactName: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    rutFilePath: { type: DataTypes.STRING, allowNull: true },
    // solo tiene sentido para type = 'proveedor', pero se deja disponible en el modelo general.
    bankCertificationFilePath: { type: DataTypes.STRING, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  ThirdParty.associate = (models) => {
    ThirdParty.hasMany(models.PurchaseOrder, { foreignKey: 'supplierId', as: 'purchaseOrders' });
    ThirdParty.hasMany(models.Project, { foreignKey: 'clientId', as: 'projects' });
    ThirdParty.hasMany(models.Quotation, { foreignKey: 'clientId', as: 'quotations' });
  };

  return ThirdParty;
};
