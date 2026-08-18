require('dotenv').config();
const { sequelize, Company } = require('./models');
const { applyPreSyncFixups } = require('./utils/preSyncFixups');
const { applyPostSyncFixups } = require('./utils/postSyncFixups');
const { seedDefaultsForCompany } = require('./services/companyProvisioningService');

async function seed() {
  await sequelize.authenticate();
  await applyPreSyncFixups();
  await sequelize.sync({ alter: true });
  await applyPostSyncFixups();

  // Instalación existente (ej. producción, ya migrada a multi-tenant): usa la primera empresa que
  // encuentre — no crea una nueva ni pisa sus datos. Instalación nueva (ej. este sandbox de
  // desarrollo, sin ninguna empresa todavía): crea una empresa por defecto para arrancar.
  let company = await Company.findOne({ order: [['createdAt', 'ASC']] });
  if (!company) {
    company = await Company.create({ companyName: 'Mi Empresa Constructora' });
  }
  // El default de % prestaciones subió de 70% a 85%: si la instancia ya tenía guardado el valor
  // viejo (nunca personalizado a mano), se actualiza; si alguien ya lo cambió a otra cosa, se respeta.
  if (Number(company.defaultPrestacionalPercent) === 70) {
    await company.update({ defaultPrestacionalPercent: 85 });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@empresa.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
  await seedDefaultsForCompany(company, { adminName: 'Administrador', adminEmail, adminPassword });

  console.log('Seed completado.');
  console.log(`Usuario admin: ${adminEmail} / contraseña: ${adminPassword}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
