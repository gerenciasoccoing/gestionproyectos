// Calcula y persiste APU.directCost para todo el catálogo existente, una sola vez: la columna se
// agregó con default 0, así que los APU creados antes de este cambio quedaron en 0 hasta correr
// esto. Reusa exactamente la misma fórmula que budgetService.computeSectionCosts, pero en un solo
// query masivo (en vez de uno por APU) porque es un paso de un solo uso, no un endpoint.
//
// Uso: node src/scripts/backfillApuDirectCost.js
require('dotenv').config();
const { sequelize, Company, APU, APUComponent, PriceItem } = require('../models');
const { computeSectionCosts } = require('../services/budgetService');
const { runWithCompany, getCurrentTransaction } = require('../utils/tenantContext');

// APU está protegido por aislamiento multi-tenant: recorre cada empresa por separado (en vez de
// una sola consulta global) para que el backfill de cada una solo toque su propio catálogo.
async function run() {
  const companies = await Company.findAll();
  for (const company of companies) {
    // eslint-disable-next-line no-await-in-loop
    await runWithCompany(company.id, async () => {
      const apus = await APU.findAll({
        include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
      });
      console.log(`[${company.companyName}] Recalculando directCost para ${apus.length} APU...`);

      const updates = apus.map((apu) => {
        const sections = computeSectionCosts(apu.components);
        const directCost = sections.materialsCost + sections.herramientasCost + sections.personalCost + sections.transporteCost + Number(apu.otherCosts || 0);
        return { id: apu.id, directCost };
      });

      const BATCH_SIZE = 500;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const values = batch.map((u) => `(${sequelize.escape(u.id)}, ${u.directCost})`).join(',');
        // eslint-disable-next-line no-await-in-loop
        // Capa 2 (RLS): sin pasar la transacción activa a mano, este UPDATE crudo correría en una
        // conexión sin el GUC app.current_company_id seteado y quedaría bloqueado en silencio.
        await sequelize.query(
          `UPDATE "APUs" AS a SET "directCost" = v.dc FROM (VALUES ${values}) AS v(id, dc) WHERE a.id = v.id::uuid`,
          { transaction: getCurrentTransaction() }
        );
        console.log(`  ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}`);
      }
    });
  }

  console.log('Backfill completado.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
