require('dotenv').config();
const bcrypt = require('bcryptjs');
const {
  sequelize, User, Tenant, Category, Product,
} = require('./models');

async function seed() {
  await sequelize.sync({ alter: true });

  // Super-admin: dueño de la plataforma, sin tenantId.
  const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@tuapp.com';
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || 'changeme123';
  await User.findOrCreate({
    where: { email: superAdminEmail, tenantId: null },
    defaults: {
      name: 'Super Admin', passwordHash: await bcrypt.hash(superAdminPassword, 10), role: 'super_admin',
    },
  });

  // Tenant de prueba, para poder probar la Fase 1/2 de punta a punta sin depender de DNS real:
  // en local se accede pasando el header X-Tenant-Subdomain: demo (o ?tenant=demo).
  const [tenant] = await Tenant.findOrCreate({
    where: { subdomain: 'demo' },
    defaults: {
      name: 'Tienda Demo',
      nit: '900123456-1',
      plan: 'trial',
      colorPrimary: '#4f46e5',
      colorSecondary: '#1e1b4b',
      shippingType: 'fixed',
      shippingFixedRate: 12000,
    },
  });

  await User.findOrCreate({
    where: { email: 'admin@demo.com', tenantId: tenant.id },
    defaults: {
      name: 'Admin Demo', passwordHash: await bcrypt.hash('demo1234', 10), role: 'tenant_admin',
    },
  });
  await User.findOrCreate({
    where: { email: 'operador@demo.com', tenantId: tenant.id },
    defaults: {
      name: 'Operador Demo', passwordHash: await bcrypt.hash('demo1234', 10), role: 'tenant_operator',
    },
  });

  const [category] = await Category.findOrCreate({
    where: { tenantId: tenant.id, slug: 'general' },
    defaults: { name: 'General', active: true },
  });

  const sampleProducts = [
    {
      name: 'Camiseta básica', slug: 'camiseta-basica', price: 45000, stock: 20, lowStockThreshold: 5,
    },
    {
      name: 'Taza de cerámica', slug: 'taza-ceramica', price: 25000, stock: 3, lowStockThreshold: 5,
    },
    {
      name: 'Gorra bordada', slug: 'gorra-bordada', price: 38000, stock: 15, lowStockThreshold: 5,
    },
  ];
  for (const p of sampleProducts) {
    await Product.findOrCreate({
      where: { tenantId: tenant.id, slug: p.slug },
      defaults: {
        ...p,
        tenantId: tenant.id,
        categoryId: category.id,
        description: `${p.name} de muestra para probar la tienda.`,
        images: [],
        trackInventory: true,
        active: true,
      },
    });
  }

  console.log('Seed completado.');
  console.log(`Super-admin: ${superAdminEmail} / ${superAdminPassword}`);
  console.log('Tenant demo -> subdominio: demo | admin@demo.com / demo1234 | operador@demo.com / demo1234');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error al ejecutar el seed:', err);
    process.exit(1);
  });
