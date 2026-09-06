const { APU, APUComponent, PriceItem, PurchaseOrder, PurchaseOrderItem } = require('../models');
const { getBudgetItemsWithProgress } = require('./budgetService');

// Consolidado de recursos de TODO el proyecto (solo aplica a ítems con APU, ver "Presupuesto del
// Proyecto" > modo con APU): por cada ítem del presupuesto, toma su APU, multiplica la cantidad
// de cada recurso del APU por la cantidad del ítem, y suma los recursos con el mismo nombre entre
// TODOS los ítems — funciona igual para un APU privado de este proyecto o uno del catálogo
// global (la fórmula solo depende de category/quantity/yield/wastePercent, no de dónde salió el
// recurso). Se recalcula siempre en vivo (sin caché): cualquier edición de cantidad de un ítem o
// de un componente de APU se refleja de inmediato la próxima vez que se pida este consolidado.
//
// Cantidad efectiva de UN recurso por cada unidad del ítem, según categoría — misma fórmula que
// budgetService.computeSectionCosts (ahí se multiplica por el valor unitario para dar costo; acá
// se deja en cantidad física para el consolidado):
//   Materiales:   quantity * (1 + wastePercent/100)                 (incluye desperdicio)
//   Equipos:      quantity * yield                                  (mismo criterio que costo)
//   Mano de obra: quantity / yield                                  (en jornales/día-persona)
//   Transporte:   quantity, SOLO en modo distancia_peso — el modo "porcentaje_materiales" no
//                 tiene una cantidad física real (es un % de costo), así que esas líneas no
//                 aportan cantidad al consolidado de Transporte.
function effectiveQuantityPerItem(component) {
  const quantity = Number(component.quantity);
  if (component.category === 'material') {
    return quantity * (1 + Number(component.wastePercent || 0) / 100);
  }
  if (component.category === 'herramienta') {
    return quantity * (Number(component.yield) || 1);
  }
  if (component.category === 'personal') {
    return quantity / (Number(component.yield) || 1);
  }
  if (component.category === 'transporte') {
    return component.transportMode === 'porcentaje_materiales' ? null : quantity;
  }
  return null;
}

function resourceName(component) {
  return component.priceItem?.name || component.description || '-';
}
function resourceUnit(component) {
  return component.priceItem?.unit || component.unit || '-';
}

const CATEGORY_TO_LIST = { material: 'materials', personal: 'labor', herramienta: 'equipment', transporte: 'transport' };

async function computeResourceConsolidation(projectId) {
  const { items } = await getBudgetItemsWithProgress(projectId);
  const apuIds = [...new Set(items.filter((it) => it.apuId).map((it) => it.apuId))];

  const totals = { materials: new Map(), labor: new Map(), equipment: new Map(), transport: new Map() };
  if (!apuIds.length) return { materials: [], labor: [], equipment: [], transport: [] };

  const apus = await APU.findAll({
    where: { id: apuIds },
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  const apuById = new Map(apus.map((a) => [a.id, a]));

  for (const item of items) {
    if (!item.apuId) continue;
    const apu = apuById.get(item.apuId);
    if (!apu) continue;
    const itemQty = Number(item.quantity);

    for (const component of apu.components) {
      const qtyPerItem = effectiveQuantityPerItem(component);
      if (qtyPerItem === null) continue;
      const listKey = CATEGORY_TO_LIST[component.category];
      if (!listKey) continue;

      const name = resourceName(component);
      const unit = resourceUnit(component);
      const groupKey = name.trim().toLowerCase();
      const map = totals[listKey];
      const existing = map.get(groupKey);
      const addedQty = itemQty * qtyPerItem;
      if (existing) existing.quantity += addedQty;
      else map.set(groupKey, { name, unit, quantity: addedQty });
    }
  }

  const toSortedArray = (map) => [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    materials: toSortedArray(totals.materials),
    labor: toSortedArray(totals.labor),
    equipment: toSortedArray(totals.equipment),
    transport: toSortedArray(totals.transport),
  };
}

const ALERT_WARNING_PERCENT = 80;

function alertStatus(percent) {
  if (percent === null) return null;
  if (percent > 100) return 'exceeded';
  if (percent >= ALERT_WARNING_PERCENT) return 'warning';
  return 'ok';
}

// Cantidad ya comprada de cada recurso, tomada de TODAS las Órdenes de Compra del proyecto
// (cualquier estado: una OC ya refleja una decisión de compra), agrupada por el mismo nombre
// normalizado (trim + minúsculas) que usa el consolidado, para poder comparar uno a uno.
async function getPurchasedQuantitiesByName(projectId) {
  const orderItems = await PurchaseOrderItem.findAll({
    include: [{ model: PurchaseOrder, attributes: [], where: { projectId }, required: true }],
  });
  const map = new Map();
  for (const oi of orderItems) {
    const key = oi.name.trim().toLowerCase();
    map.set(key, (map.get(key) || 0) + Number(oi.quantityOrdered));
  }
  return map;
}

// Mismo consolidado de computeResourceConsolidation, pero además compara cada recurso contra lo
// YA comprado en Órdenes de Compra del proyecto (por nombre) — alimenta a la vez la alerta de
// consumo real ("¿ya se compró más de lo consolidado?") y la comparación OC vs. consolidado en
// pantalla, con una sola tabla y un solo cálculo (ver ResourceConsolidationSection.jsx). Mano de
// obra queda fuera de la comparación: Gastos solo registra valor, no jornales, así que no existe
// ninguna fuente de cantidad real comparable en el sistema para ese recurso.
async function computeResourceConsolidationWithPurchases(projectId) {
  const consolidation = await computeResourceConsolidation(projectId);
  const purchasedByName = await getPurchasedQuantitiesByName(projectId);

  const annotate = (rows) => rows.map((row) => {
    const purchasedQuantity = purchasedByName.get(row.name.trim().toLowerCase()) || 0;
    const percent = row.quantity > 0 ? Math.round((purchasedQuantity / row.quantity) * 10000) / 100 : null;
    return { ...row, purchasedQuantity, percent, status: alertStatus(percent) };
  });

  return {
    materials: annotate(consolidation.materials),
    labor: consolidation.labor.map((row) => ({ ...row, purchasedQuantity: null, percent: null, status: null })),
    equipment: annotate(consolidation.equipment),
    transport: annotate(consolidation.transport),
  };
}

module.exports = { computeResourceConsolidation, computeResourceConsolidationWithPurchases };
