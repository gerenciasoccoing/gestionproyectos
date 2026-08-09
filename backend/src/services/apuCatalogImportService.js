const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const {
  sequelize, APU, APUComponent, PriceItem, PriceListImport, APUPriceHistory, BudgetItem,
} = require('../models');
const { parseBudgetWorkbook, collectInsumos, upsertPriceItems, computeBlockDirectCost } = require('./budgetImportService');
const { computeSectionCosts } = require('./budgetService');

const BATCH_SIZE = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Arma las filas de APUComponent para un bloque del listado, igual que budgetImportService, pero
// para el catálogo global (no atado a un presupuesto/proyecto).
function buildComponentRows(apuId, block, priceItemIdByCode) {
  const rows = [];
  for (const m of block.materials) {
    if (m.precio <= 0) continue; // absorbido en otherCosts (ver computeBlockDirectCost)
    const priceItemId = priceItemIdByCode.get(m.code);
    if (!priceItemId) continue;
    rows.push({
      id: crypto.randomUUID(), apuId, category: 'material', priceItemId,
      quantity: m.cantidadBase, wastePercent: m.wastePercent, yield: 1,
    });
  }
  for (const p of block.personal) {
    // rendimiento (p.qty) en 0 significa que esta línea no aplica realmente (el archivo fuente
    // la computa como $0 en "Total Unitario"); si se creara con yield=1 por defecto, el costo en
    // vivo cobraría el valor completo en vez de nada. Se omite, igual que el resto de líneas sin
    // aporte real.
    if (p.precio <= 0 || !p.qty) continue;
    const priceItemId = priceItemIdByCode.get(p.code);
    if (!priceItemId) continue;
    rows.push({ id: crypto.randomUUID(), apuId, category: 'personal', priceItemId, quantity: 1, yield: p.qty, prestacionalPercent: 0 });
  }
  for (const e of block.equipos) {
    if (e.precio <= 0) continue;
    const priceItemId = priceItemIdByCode.get(e.code);
    if (!priceItemId) continue;
    rows.push({ id: crypto.randomUUID(), apuId, category: 'herramienta', priceItemId, quantity: e.qty ? 1 / e.qty : 0, yield: 1 });
  }
  return rows;
}

// Costo directo actual de un APU ya cargado con sus componentes (mismo cálculo que usa la app en
// vivo), para comparar contra el nuevo valor del listado que se está importando.
function currentDirectCost(apu) {
  const sections = computeSectionCosts(apu.components);
  return sections.materialsCost + sections.herramientasCost + sections.personalCost + sections.transporteCost + Number(apu.otherCosts || 0);
}

// Importa/actualiza el catálogo global de APU desde un Excel con el formato del listado oficial
// de precios unitarios (hojas "Items de Presupuesto" + "Unitarios"). Solo se importan los APU
// referenciados por algún ítem de la hoja "Items de Presupuesto" (no todo el listado completo).
//
// Por código de APU: si no existe, se crea; si existe, se compara su costo directo actual contra
// el nuevo y, si cambió, se reemplazan sus componentes y se registra el cambio (con cuántos
// BudgetItem ya existentes lo referencian, de forma solo informativa). Ningún BudgetItem se toca:
// su unitCost/totalCost quedan fijos como siempre (ver budgetController.addItem).
async function importApuCatalog({ buffer, sourceLabel, effectiveDate, fileName, userId }) {
  if (!sourceLabel || !sourceLabel.trim()) throw new ApiError(400, 'sourceLabel es obligatorio (ej. "Listado Abril 2026")');

  const { apuBlocks } = await parseBudgetWorkbook(buffer);
  const validBlocks = Object.entries(apuBlocks).filter(([, block]) => block.hasComponents);
  if (!validBlocks.length) {
    throw new ApiError(400, 'No se encontraron análisis unitarios con desglose reconocible para los ítems de presupuesto del archivo.');
  }

  const insumos = collectInsumos(Object.fromEntries(validBlocks));
  const today = effectiveDate || new Date().toISOString().slice(0, 10);

  return sequelize.transaction(async (t) => {
    const priceListImport = await PriceListImport.create({
      sourceLabel: sourceLabel.trim(), fileName: fileName || null, effectiveDate: today, importedBy: userId || null,
    }, { transaction: t });

    // El costo "antes" de cada APU existente se calcula ANTES de actualizar la Base de Precios:
    // si se calculara después, cualquier insumo compartido ya tendría el precio nuevo y un cambio
    // de precio puro (lo más común) quedaría invisible en la comparación (viejo vs. nuevo usarían
    // el mismo precio "nuevo").
    const codes = validBlocks.map(([code]) => code);
    const existingApus = await APU.findAll({
      where: { code: codes },
      include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
      order: [['createdAt', 'ASC']],
      transaction: t,
    });
    // `code` no tiene restricción de unicidad en la base de datos (ej. si un APU se creó dos
    // veces por error, manualmente o por una importación anterior a esta funcionalidad); si hay
    // duplicados, se actualiza el más reciente por código y se deja el resto sin tocar.
    const existingByCode = new Map(existingApus.map((a) => [a.code, a]));
    const oldDirectCostByApuId = new Map(existingApus.map((a) => [a.id, currentDirectCost(a)]));

    const { priceItemIdByCode } = await upsertPriceItems(insumos, today, t);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const changes = [];
    const historyRows = [];
    const newApuRows = [];
    const newComponentRows = [];

    for (const [code, block] of validBlocks) {
      const { directCost, otherCosts } = computeBlockDirectCost(block);
      const existing = existingByCode.get(code);

      if (!existing) {
        const apuId = crypto.randomUUID();
        newApuRows.push({ id: apuId, code, name: block.description, unit: block.unit, otherCosts, lastPriceListImportId: priceListImport.id });
        newComponentRows.push(...buildComponentRows(apuId, block, priceItemIdByCode));
        historyRows.push({ apuId, priceListImportId: priceListImport.id, directCost, effectiveDate: today });
        created++;
        continue;
      }

      const oldDirectCost = oldDirectCostByApuId.get(existing.id);
      const delta = directCost - oldDirectCost;
      if (Math.abs(delta) < 0.01) { unchanged++; continue; }

      // eslint-disable-next-line no-await-in-loop
      const affectedBudgetItemsCount = await BudgetItem.count({ where: { apuId: existing.id }, transaction: t });
      changes.push({
        apuId: existing.id,
        code,
        name: block.description,
        oldTotal: Math.round(oldDirectCost * 100) / 100,
        newTotal: Math.round(directCost * 100) / 100,
        deltaPercent: oldDirectCost ? Math.round((delta / oldDirectCost) * 10000) / 100 : null,
        affectedBudgetItemsCount,
      });

      existing.name = block.description;
      existing.unit = block.unit;
      existing.otherCosts = otherCosts;
      existing.lastPriceListImportId = priceListImport.id;
      // eslint-disable-next-line no-await-in-loop
      await existing.save({ transaction: t });
      // eslint-disable-next-line no-await-in-loop
      await APUComponent.destroy({ where: { apuId: existing.id }, transaction: t });
      newComponentRows.push(...buildComponentRows(existing.id, block, priceItemIdByCode));
      historyRows.push({ apuId: existing.id, priceListImportId: priceListImport.id, directCost, effectiveDate: today });
      updated++;
    }

    for (const batch of chunk(newApuRows, BATCH_SIZE)) await APU.bulkCreate(batch, { transaction: t });
    for (const batch of chunk(newComponentRows, BATCH_SIZE)) await APUComponent.bulkCreate(batch, { transaction: t });
    for (const batch of chunk(historyRows, BATCH_SIZE)) await APUPriceHistory.bulkCreate(batch, { transaction: t });

    priceListImport.apusCreated = created;
    priceListImport.apusUpdated = updated;
    priceListImport.apusUnchanged = unchanged;
    await priceListImport.save({ transaction: t });

    return {
      priceListImportId: priceListImport.id,
      sourceLabel: priceListImport.sourceLabel,
      created,
      updated,
      unchanged,
      changes: changes.sort((a, b) => Math.abs(b.deltaPercent || 0) - Math.abs(a.deltaPercent || 0)),
    };
  });
}

module.exports = { importApuCatalog };
