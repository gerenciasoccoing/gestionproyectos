const { Worker } = require('worker_threads');
const path = require('path');
const crypto = require('crypto');
const { sequelize, Budget, BudgetItem, APU, APUComponent, PriceItem, PriceHistory } = require('../models');
const ApiError = require('../utils/ApiError');

const BATCH_SIZE = 500;

// Aísla el parseo (xlsx + recorrido de ~130.000 filas típico) en un worker con timeout,
// igual que excelParseService.js.
function parseBudgetWorkbook(buffer, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '../workers/budgetImportWorker.js'), {
      workerData: { buffer },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('El archivo tardó demasiado en procesarse (puede estar corrupto, no ser un Excel válido, o no tener el formato esperado).'));
    }, timeoutMs);

    worker.once('message', (msg) => {
      clearTimeout(timer);
      worker.terminate();
      if (msg.ok) resolve({ budgetItems: msg.budgetItems, apuBlocks: msg.apuBlocks });
      else reject(new Error(msg.error));
    });

    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Error procesando el archivo: ${err.message}`));
    });
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// El "Precio" de Personal/Equipos en este tipo de listado ya viene cargado (incluye
// prestaciones/administración propia del insumo), así que se importa tal cual como valor
// unitario y el componente de APU se crea con prestacionalPercent=0 para no duplicar el cargo.
// Algunas filas (ej. "TRANS00" Transporte en Material, "HMEQ00" Herramienta Menor en Equipos)
// traen Precio=0 con un Parcial ya calculado por otro medio (no reproducible como cant*precio).
// No se crean como insumo de la Base de Precios (no tienen una tarifa unitaria reutilizable);
// su Parcial se absorbe directo en el otherCosts del APU (ver computeBlockDirectCost).
function collectInsumos(apuBlocks) {
  const insumos = new Map(); // code -> { type, name, unit, currentValue }
  for (const block of Object.values(apuBlocks)) {
    for (const m of block.materials) {
      if (m.code && m.precio > 0) insumos.set(m.code, { type: 'material', name: m.name, unit: m.unit, currentValue: m.precio });
    }
    for (const p of block.personal) {
      if (p.code && p.precio > 0) insumos.set(p.code, { type: 'mano_obra', name: p.name, unit: p.unit, currentValue: p.precio });
    }
    for (const e of block.equipos) {
      if (e.code && e.precio > 0) insumos.set(e.code, { type: 'equipo', name: e.name, unit: e.unit, currentValue: e.precio });
    }
  }
  return insumos;
}

// Crea/actualiza la Base de Precios con los insumos referenciados (mismo criterio que
// priceImportService: coincide por código; si no existe, lo crea).
async function upsertPriceItems(insumos, effectiveDate, t) {
  const codes = [...insumos.keys()];
  const existing = await PriceItem.findAll({ where: { code: codes }, transaction: t });
  const existingByCode = new Map(existing.map((i) => [i.code, i]));

  const toCreate = [];
  const toUpdate = [];
  for (const [code, data] of insumos) {
    const item = existingByCode.get(code);
    if (item) toUpdate.push({ item, ...data });
    else toCreate.push({ code, ...data });
  }

  const priceItemIdByCode = new Map(existing.map((i) => [i.code, i.id]));
  let created = 0;
  let updated = 0;

  for (const batch of chunk(toCreate, BATCH_SIZE)) {
    const rows = batch.map((r) => ({ id: crypto.randomUUID(), type: r.type, code: r.code, name: r.name, unit: r.unit, currentValue: r.currentValue }));
    await PriceItem.bulkCreate(rows, { transaction: t });
    await PriceHistory.bulkCreate(
      rows.map((r) => ({ priceItemId: r.id, value: r.currentValue, effectiveDate })),
      { transaction: t }
    );
    rows.forEach((r) => priceItemIdByCode.set(r.code, r.id));
    created += rows.length;
  }

  for (const batch of chunk(toUpdate, BATCH_SIZE)) {
    for (const u of batch) {
      u.item.currentValue = u.currentValue;
      u.item.unit = u.unit;
      await u.item.save({ transaction: t });
    }
    await PriceHistory.bulkCreate(
      batch.map((u) => ({ priceItemId: u.item.id, value: u.currentValue, effectiveDate })),
      { transaction: t }
    );
    updated += batch.length;
  }

  return { priceItemIdByCode, created, updated };
}

// Costo directo de un bloque a partir de sus componentes, con las mismas fórmulas que
// budgetService.computeSectionCosts. Usa el precio tal como viene en el archivo (es el mismo
// valor que se acaba de guardar en la Base de Precios), sin necesidad de releer la BD.
function computeBlockDirectCost(block) {
  let materialsCost = 0;
  let personalCost = 0;
  let herramientasCost = 0;
  let otherCosts = 0;

  for (const m of block.materials) {
    if (m.precio > 0) materialsCost += m.qty * m.precio;
    else otherCosts += m.parcial;
  }
  for (const p of block.personal) {
    if (p.precio > 0) personalCost += p.qty ? p.precio / p.qty : 0;
    else otherCosts += p.parcial;
  }
  for (const e of block.equipos) {
    if (e.precio > 0) herramientasCost += e.qty ? e.precio / e.qty : 0;
    else otherCosts += e.parcial;
  }

  return { directCost: materialsCost + personalCost + herramientasCost + otherCosts, otherCosts };
}

function applyBudgetAiu(directCost, aiu) {
  const pct = Number(aiu.adminPercent || 0) + Number(aiu.imprevistosPercent || 0) + Number(aiu.utilidadPercent || 0);
  return directCost * (1 + pct / 100);
}

// Importa un presupuesto completo (ítems + sus APU con materiales/personal/equipos) desde un
// Excel con el formato de listado oficial de precios unitarios (hojas "Items de Presupuesto" +
// "Unitarios"). Crea/actualiza la Base de Precios con los insumos referenciados, crea un APU por
// cada ítem de presupuesto (con sus componentes) y crea el presupuesto con esos ítems.
async function importBudgetFromWorkbook({ projectId, buffer, aiu, type = 'inicial' }) {
  const { budgetItems, apuBlocks } = await parseBudgetWorkbook(buffer);
  if (!budgetItems.length) throw new ApiError(400, 'El archivo no contiene ítems de presupuesto reconocibles.');

  const insumos = collectInsumos(apuBlocks);
  const today = new Date().toISOString().slice(0, 10);

  const skipped = [];
  const result = await sequelize.transaction(async (t) => {
    const { priceItemIdByCode: idMap, created: priceItemsCreated, updated: priceItemsUpdated } = await upsertPriceItems(insumos, today, t);

    const last = await Budget.findOne({ where: { projectId }, order: [['version', 'DESC']], transaction: t });
    const budget = await Budget.create({
      projectId,
      version: last ? last.version + 1 : 1,
      type,
      adminPercent: aiu.adminPercent || 0,
      imprevistosPercent: aiu.imprevistosPercent || 0,
      utilidadPercent: aiu.utilidadPercent || 0,
    }, { transaction: t });

    const apuRows = [];
    const componentRows = [];
    const budgetItemRows = [];

    for (const item of budgetItems) {
      const block = apuBlocks[item.apuCode];
      if (!block || !block.hasComponents) { skipped.push({ item: item.itemCode, description: item.description, reason: 'Sin análisis unitario reconocible en el archivo' }); continue; }

      const { directCost, otherCosts } = computeBlockDirectCost(block);
      const apuId = crypto.randomUUID();
      apuRows.push({
        id: apuId,
        name: item.description,
        unit: block.unit || item.unit,
        code: item.apuCode,
        otherCosts,
      });

      for (const m of block.materials) {
        if (m.precio <= 0) continue; // ej. "Transporte": ya absorbido en otherCosts
        const priceItemId = idMap.get(m.code);
        if (!priceItemId) continue;
        componentRows.push({ id: crypto.randomUUID(), apuId, category: 'material', priceItemId, quantity: m.qty, yield: 1 });
      }
      for (const p of block.personal) {
        if (p.precio <= 0) continue; // ya absorbido en otherCosts
        const priceItemId = idMap.get(p.code);
        if (!priceItemId) continue;
        componentRows.push({ id: crypto.randomUUID(), apuId, category: 'personal', priceItemId, quantity: 1, yield: p.qty || 1, prestacionalPercent: 0 });
      }
      for (const e of block.equipos) {
        if (e.precio <= 0) continue; // el "Precio 0" (ej. herramienta menor) ya quedó absorbido en otherCosts
        const priceItemId = idMap.get(e.code);
        if (!priceItemId) continue;
        componentRows.push({ id: crypto.randomUUID(), apuId, category: 'herramienta', priceItemId, quantity: e.qty ? 1 / e.qty : 0, yield: 1 });
      }

      // Convención del listado fuente: el AIU solo aplica a ítems "UNITARIO"; los "ELABORADO"
      // (recetas/insumos compuestos, ej. concretos) se presupuestan a costo directo puro.
      const unitCost = block.tipo === 'ELABORADO' ? directCost : applyBudgetAiu(directCost, aiu);
      budgetItemRows.push({
        id: crypto.randomUUID(),
        budgetId: budget.id,
        apuId,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitCost,
        totalCost: Number(item.quantity) * unitCost,
      });
    }

    for (const batch of chunk(apuRows, BATCH_SIZE)) await APU.bulkCreate(batch, { transaction: t });
    for (const batch of chunk(componentRows, BATCH_SIZE)) await APUComponent.bulkCreate(batch, { transaction: t });
    for (const batch of chunk(budgetItemRows, BATCH_SIZE)) await BudgetItem.bulkCreate(batch, { transaction: t });

    return {
      budgetId: budget.id,
      priceItemsCreated,
      priceItemsUpdated,
      apusCreated: apuRows.length,
      componentsCreated: componentRows.length,
      budgetItemsCreated: budgetItemRows.length,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50),
    };
  });

  return result;
}

module.exports = { importBudgetFromWorkbook };
