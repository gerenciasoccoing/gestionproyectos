// Empresas ya existentes (creadas antes de agregar el módulo "Estudio de Mercado de
// Cotizaciones") no tienen filas Permission para el módulo nuevo 'estudio_mercado' — solo las
// empresas creadas DESPUÉS de este cambio las reciben automáticamente (ver
// companyProvisioningService.js#seedDefaultsForCompany, que solo corre al aprovisionar una
// empresa). Este script las crea para TODAS las empresas y las agrega (nunca reemplaza) al rol
// 'admin' de cada una, para no pisar personalizaciones que un admin ya le haya hecho a sus otros
// roles desde Administración > Roles.
//
// El módulo en sí queda apagado por defecto para todas (ver Company.enabledFeatures) — correr este
// script solo deja el permiso disponible para cuando el super-administrador active el módulo para
// una empresa puntual; no lo activa.
//
// Uso: node src/scripts/backfillMarketStudyPermissions.js
require('dotenv').config();
const { Company, Permission, Role } = require('../models');
const { ACTIONS } = require('../config/permissions');
const { runWithCompany } = require('../utils/tenantContext');

const MODULE_NAME = 'estudio_mercado';

async function run() {
  const companies = await Company.findAll();
  let totalUpdated = 0;
  const failures = [];

  for (const company of companies) {
    // eslint-disable-next-line no-await-in-loop
    await runWithCompany(company.id, async () => {
      try {
        const permissions = [];
        for (const action of ACTIONS) {
          // eslint-disable-next-line no-await-in-loop
          const [perm] = await Permission.findOrCreate({ where: { module: MODULE_NAME, action } });
          permissions.push(perm);
        }
        const adminRole = await Role.findOne({ where: { name: 'admin', companyId: company.id } });
        if (!adminRole) {
          console.log(`[${company.companyName}] Sin rol 'admin' — se omite.`);
          return;
        }
        await adminRole.addPermissions(permissions);
        totalUpdated += 1;
        console.log(`[${company.companyName}] Permisos de '${MODULE_NAME}' agregados al rol admin.`);
      } catch (err) {
        failures.push({ company: company.companyName, error: err.message });
        console.error(`[${company.companyName}] ERROR: ${err.message}`);
      }
    });
  }

  console.log(`\nBackfill completado: ${totalUpdated} empresa(s) actualizada(s), ${failures.length} error(es).`);
  process.exit(failures.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
