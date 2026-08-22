const { DataTypes } = require('sequelize');
const { encrypt, decrypt } = require('../utils/crypto');

// Tabla raíz del multi-tenant: toda la demás información del negocio cuelga de un tenant_id.
module.exports = (sequelize) => {
  const Tenant = sequelize.define('Tenant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    nit: { type: DataTypes.STRING, allowNull: true },
    subdomain: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { is: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/ },
    },
    customDomain: { type: DataTypes.STRING, allowNull: true, unique: true },
    logoUrl: { type: DataTypes.STRING, allowNull: true },
    colorPrimary: { type: DataTypes.STRING, allowNull: false, defaultValue: '#4f46e5' },
    colorSecondary: { type: DataTypes.STRING, allowNull: false, defaultValue: '#1e1b4b' },
    plan: { type: DataTypes.STRING, allowNull: false, defaultValue: 'trial' },
    status: {
      type: DataTypes.ENUM('active', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    },

    // Envío
    shippingType: { type: DataTypes.ENUM('fixed', 'free'), allowNull: false, defaultValue: 'fixed' },
    shippingFixedRate: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },

    // Pasarela de pagos (Wompi). Las llaves privadas/secretas se guardan cifradas.
    paymentProvider: { type: DataTypes.STRING, allowNull: false, defaultValue: 'wompi' },
    wompiPublicKey: { type: DataTypes.STRING, allowNull: true },
    wompiPrivateKeyEnc: { type: DataTypes.STRING, allowNull: true },
    wompiEventsSecretEnc: { type: DataTypes.STRING, allowNull: true },
    wompiIntegritySecretEnc: { type: DataTypes.STRING, allowNull: true },
    wompiSandbox: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

  // Las credenciales sensibles se guardan cifradas (*_Enc). Estos helpers de instancia
  // centralizan el cifrado/descifrado para que los controladores nunca manipulen texto plano.
  Tenant.prototype.getWompiPrivateKey = function getWompiPrivateKey() {
    return decrypt(this.wompiPrivateKeyEnc);
  };
  Tenant.prototype.getWompiEventsSecret = function getWompiEventsSecret() {
    return decrypt(this.wompiEventsSecretEnc);
  };
  Tenant.prototype.getWompiIntegritySecret = function getWompiIntegritySecret() {
    return decrypt(this.wompiIntegritySecretEnc);
  };
  Tenant.prototype.setWompiPrivateKey = function setWompiPrivateKey(value) {
    this.wompiPrivateKeyEnc = encrypt(value);
  };
  Tenant.prototype.setWompiEventsSecret = function setWompiEventsSecret(value) {
    this.wompiEventsSecretEnc = encrypt(value);
  };
  Tenant.prototype.setWompiIntegritySecret = function setWompiIntegritySecret(value) {
    this.wompiIntegritySecretEnc = encrypt(value);
  };

  Tenant.associate = (models) => {
    Tenant.hasMany(models.User, { foreignKey: 'tenantId' });
    Tenant.hasMany(models.Customer, { foreignKey: 'tenantId' });
    Tenant.hasMany(models.Category, { foreignKey: 'tenantId' });
    Tenant.hasMany(models.Product, { foreignKey: 'tenantId' });
    Tenant.hasMany(models.Order, { foreignKey: 'tenantId' });
    Tenant.hasMany(models.InventoryMovement, { foreignKey: 'tenantId' });
  };

  return Tenant;
};
