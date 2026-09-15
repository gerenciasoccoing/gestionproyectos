// Empresas ya existentes (creadas antes de agregar el módulo "Entrega Final") no tienen filas
// Permission para el módulo nuevo 'entrega_final' — solo las empresas creadas DESPUÉS de este
// cambio las reciben automáticamente (ver companyProvisioningService.js#seedDefaultsForCompany,
// que solo corre al aprovisionar una empresa). Este script las crea para TODAS las empresas y las
// agrega (nunca reemplaza) a los roles por defecto que correspondan según config/permissions.js,
// para no pisar personalizaciones que un admin ya le haya hecho a sus otros roles desde
// Administración > Roles. Si una empresa renombró o eliminó alguno de estos roles por defecto, ese
// rol puntual se omite (mismo criterio que backfillMarketStudyPermissions.js).
//
// A diferencia de Estudio de Mercado, "Entrega Final" no es un módulo "plus" (no depende de
// Company.enabledFeatures) — queda disponible de inmediato para los roles que ya tenían acceso
// equivalente a las demás secciones de proyecto.
//
// Uso: node src/scripts/backfillEntregaFinalPermissions.js
require('dotenv').config();
const { Company, Permission, Role } = require('../models');
const { runWithCompany } = require('../utils/tenantContext');

const MODULE_NAME = 'entrega_final';
const ALL_ACTIONS = ['view', 'create', 'edit', 'delete'];

// Mismo reparto que DEFAULT_ROLE_PERMISSIONS en config/permissions.js para este módulo.
const ROLE_ACTIONS = {
  admin: ALL_ACTIONS,
  gerente_proyecto: ALL_ACTIONS,
  residente_obra: ['view', 'create'],
  financiero: ['view', 'create', 'edit'],
};

async function run() {
  const companies = await Company.findAll();
  let totalUpdated = 0;
  const failures = [];

  for (const company of companies) {
    // eslint-disable-next-line no-await-in-loop
    await runWithCompany(company.id, async () => {
      try {
        const permByAction = {};
        for (const action of ALL_ACTIONS) {
          // eslint-disable-next-line no-await-in-loop
          const [perm] = await Permission.findOrCreate({ where: { module: MODULE_NAME, action } });
          permByAction[action] = perm;
        }

        let anyRoleUpdated = false;
        for (const [roleName, actions] of Object.entries(ROLE_ACTIONS)) {
          // eslint-disable-next-line no-await-in-loop
          const role = await Role.findOne({ where: { name: roleName, companyId: company.id } });
          if (!role) {
            console.log(`[${company.companyName}] Sin rol '${roleName}' — se omite.`);
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          await role.addPermissions(actions.map((a) => permByAction[a]));
          anyRoleUpdated = true;
        }
        if (anyRoleUpdated) {
          totalUpdated += 1;
          console.log(`[${company.companyName}] Permisos de '${MODULE_NAME}' agregados.`);
        }
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
