// Migración del Catálogo de Materiales por categorías — recorre todas las empresas y:
//   1. crea su categoría "Materiales" por defecto si todavía no existe (normalmente ya existe:
//      ver postSyncFixups.js#seedDefaultMaterialCategoryForExistingCompanies, que corre en cada
//      arranque — esto es un respaldo idempotente, no el único lugar donde se crea);
//   2. recorre TODAS las Órdenes de Compra existentes y, para cada ítem marcado inventariable que
//      todavía no tiene materialId (nacido antes de que existiera esta resolución automática, ver
//      purchaseOrderController.js#resolveNewItemMaterial), busca o crea su Material en el catálogo
//      (misma deduplicación por nombre+unidad normalizados que usa toda la app, ver
//      materialCatalogService.js#findOrCreateMaterial) y lo deja vinculado;
//   3. detecta posibles duplicados para revisión manual: materiales con el MISMO nombre
//      normalizado pero distinta unidad (son materiales distintos por diseño — "si el nombre es
//      igual pero la unidad es distinta, se crea como material diferente" — pero vale la pena que
//      un humano confirme que de verdad eran dos unidades distintas y no un error de captura).
//
// Los movimientos de bodega (MaterialLot/MaterialTransferLine/MaterialIssueLine/
// MaterialReturnLine) NO necesitan backfill de materialId: esa columna es NOT NULL desde que esos
// modelos existen, y createLotFromReceipt ya rechaza crear un lote si el ítem de origen no tiene
// materialId — así que ningún movimiento de bodega pudo haberse registrado nunca sin material_id.
//
// Idempotente: solo toca ítems con materialId NULL; repetirlo no hace nada si ya no quedan.
//
// Uso: node src/scripts/backfillMaterialCatalog.js
require('dotenv').config();
const { Company, PurchaseOrderItem, PurchaseOrder, Material, MaterialCategory } = require('../models');
const { runWithCompany } = require('../utils/tenantContext');
const { findOrCreateMaterial } = require('../services/materialCatalogService');
const { normalizeMaterialText } = require('../utils/textNormalize');

async function run() {
  const companies = await Company.findAll();
  let totalItemsLinked = 0;
  let totalMaterialsCreated = 0;
  const duplicatesToReview = [];
  const failures = [];

  for (const company of companies) {
    // eslint-disable-next-line no-await-in-loop
    await runWithCompany(company.id, async () => {
      try {
        const [, categoryCreated] = await MaterialCategory.findOrCreate({
          where: { isDefault: true }, defaults: { name: 'Materiales', active: true },
        });
        if (categoryCreated) console.log(`[${company.companyName}] Categoría "Materiales" creada.`);

        const itemsToLink = await PurchaseOrderItem.findAll({
          where: { inventariable: true, materialId: null },
          include: [{ model: PurchaseOrder, attributes: ['orderNumber'] }],
        });

        let itemsLinkedForCompany = 0;
        const materialsBefore = await Material.count();
        for (const item of itemsToLink) {
          if (!item.name || !item.name.trim() || !item.unit) {
            console.log(`[${company.companyName}] Ítem ${item.id} (OC-${item.PurchaseOrder?.orderNumber}) sin nombre o unidad — se omite, revisar a mano.`);
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const material = await findOrCreateMaterial({
            name: item.name, unit: item.unit, origin: 'orden_compra', originPurchaseOrderId: item.purchaseOrderId,
          });
          item.materialId = material.id;
          // eslint-disable-next-line no-await-in-loop
          await item.save();
          itemsLinkedForCompany += 1;
        }
        const materialsAfter = await Material.count();
        totalItemsLinked += itemsLinkedForCompany;
        totalMaterialsCreated += (materialsAfter - materialsBefore);
        if (itemsLinkedForCompany) {
          console.log(`[${company.companyName}] ${itemsLinkedForCompany} ítem(s) de OC vinculados a su material (${materialsAfter - materialsBefore} material(es) nuevo(s) creado(s)).`);
        }

        // Posibles duplicados para revisión manual: mismo nombre normalizado, distinta unidad.
        const allMaterials = await Material.findAll({ where: { active: true }, attributes: ['id', 'code', 'name', 'unit', 'normalizedName'] });
        const byNormalizedName = new Map();
        for (const m of allMaterials) {
          const list = byNormalizedName.get(m.normalizedName) || [];
          list.push(m);
          byNormalizedName.set(m.normalizedName, list);
        }
        for (const [, list] of byNormalizedName) {
          const distinctUnits = new Set(list.map((m) => normalizeMaterialText(m.unit || '')));
          if (list.length > 1 && distinctUnits.size > 1) {
            duplicatesToReview.push({
              company: company.companyName,
              materials: list.map((m) => `${m.code} "${m.name}" (${m.unit || 'sin unidad'})`),
            });
          }
        }
      } catch (err) {
        failures.push({ company: company.companyName, error: err.message });
        console.error(`[${company.companyName}] ERROR: ${err.message}`);
      }
    });
  }

  console.log('\n--- Resumen de la migración del Catálogo de Materiales ---');
  console.log(`Materiales creados: ${totalMaterialsCreated}`);
  console.log(`Ítems de OC vinculados: ${totalItemsLinked}`);
  console.log(`Errores: ${failures.length}`);
  if (duplicatesToReview.length) {
    console.log(`\nPosibles duplicados para revisar (mismo nombre, distinta unidad) — ${duplicatesToReview.length} grupo(s):`);
    duplicatesToReview.forEach((d) => console.log(`  [${d.company}] ${d.materials.join('  vs.  ')}`));
    console.log('Si alguno de estos de verdad es el mismo material con la unidad mal escrita, fusiónelos desde el Catálogo de Materiales (acción "Fusionar duplicados") después de corregir la unidad del que se conserve.');
  }
  process.exit(failures.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
