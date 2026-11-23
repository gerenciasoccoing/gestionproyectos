// Análisis de material por contrato (Fase 7): cantidad entregada/devuelta/consumo neto, costo real
// trazado por OC (con el detalle por OC), valor de venta (solo donde se registró precio de venta en
// la salida), margen $/% — y los ítems SIN precio de venta separados aparte, para que no distorsionen
// el margen (ver especificación). Puramente informativo y de lectura: no toca Gastos ni genera
// ningún registro nuevo — mismo criterio que materialKardexService.js (un reporte es una consulta
// sobre lo que ya se persistió en las fases 2-5, nunca una copia que pueda desincronizarse).
//
// Solo se cuentan salidas y devoluciones YA FIRMADAS (status:'firmado') — una salida pendiente
// todavía no se entregó de verdad, y una rechazada nunca salió de la bodega.
const {
  MaterialIssue, MaterialIssueLine, MaterialReturn, MaterialReturnLine, Material, MaterialLot, PurchaseOrder, Project,
} = require('../models');

function emptyMaterialEntry(materialId, material) {
  return {
    materialId,
    materialName: material?.name || '-',
    unit: material?.unit || null,
    quantityIssued: 0,
    quantityReturned: 0,
    pricedQuantity: 0,
    pricedCost: 0,
    soldValue: 0,
    unpricedQuantity: 0,
    unpricedCost: 0,
    byPurchaseOrder: new Map(),
  };
}

function ensurePoEntry(materialEntry, purchaseOrderId, purchaseOrderNumber) {
  const key = purchaseOrderId || 'sin-oc';
  if (!materialEntry.byPurchaseOrder.has(key)) {
    materialEntry.byPurchaseOrder.set(key, {
      purchaseOrderId: purchaseOrderId || null, purchaseOrderNumber: purchaseOrderNumber || null, quantity: 0, cost: 0,
    });
  }
  return materialEntry.byPurchaseOrder.get(key);
}

async function getContractAnalysis(projectId) {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'name', 'contractNumber'] });
  if (!project) return null;

  const issues = await MaterialIssue.findAll({
    where: { projectId, status: 'firmado' },
    include: [{
      model: MaterialIssueLine,
      as: 'lines',
      include: [
        { model: Material, attributes: ['id', 'name', 'unit'] },
        {
          model: MaterialLot, as: 'sourceLot', attributes: ['id', 'purchaseOrderId'],
          include: [{ model: PurchaseOrder, attributes: ['id', 'orderNumber'] }],
        },
      ],
    }],
  });

  const perMaterial = new Map();
  const lineById = new Map();

  for (const issue of issues) {
    for (const line of issue.lines) {
      lineById.set(line.id, line);
      if (!perMaterial.has(line.materialId)) perMaterial.set(line.materialId, emptyMaterialEntry(line.materialId, line.Material));
      const entry = perMaterial.get(line.materialId);
      const qty = Number(line.quantity);
      const cost = qty * Number(line.unitCost);

      entry.quantityIssued += qty;
      const po = line.sourceLot?.PurchaseOrder;
      const poEntry = ensurePoEntry(entry, po?.id, po?.orderNumber);
      poEntry.quantity += qty;
      poEntry.cost += cost;

      if (line.salePriceUnit != null) {
        entry.pricedQuantity += qty;
        entry.pricedCost += cost;
        entry.soldValue += qty * Number(line.salePriceUnit);
      } else {
        entry.unpricedQuantity += qty;
        entry.unpricedCost += cost;
      }
    }
  }

  const issueLineIds = [...lineById.keys()];
  if (issueLineIds.length) {
    const returnLines = await MaterialReturnLine.findAll({
      where: { originIssueLineId: issueLineIds },
      include: [{ model: MaterialReturn, where: { status: 'firmado' }, attributes: [] }],
    });
    for (const rLine of returnLines) {
      const origin = lineById.get(rLine.originIssueLineId);
      if (!origin) continue;
      const entry = perMaterial.get(origin.materialId);
      if (!entry) continue;
      const qty = Number(rLine.quantity);
      const cost = qty * Number(rLine.unitCost);

      entry.quantityReturned += qty;
      const po = origin.sourceLot?.PurchaseOrder;
      const poEntry = ensurePoEntry(entry, po?.id, po?.orderNumber);
      poEntry.quantity -= qty;
      poEntry.cost -= cost;

      if (origin.salePriceUnit != null) {
        entry.pricedQuantity -= qty;
        entry.pricedCost -= cost;
        entry.soldValue -= qty * Number(origin.salePriceUnit);
      } else {
        entry.unpricedQuantity -= qty;
        entry.unpricedCost -= cost;
      }
    }
  }

  const materials = [...perMaterial.values()].map((e) => {
    const marginAmount = e.soldValue - e.pricedCost;
    const marginPercent = e.soldValue > 0 ? (marginAmount / e.soldValue) * 100 : null;
    return {
      materialId: e.materialId,
      materialName: e.materialName,
      unit: e.unit,
      quantityIssued: e.quantityIssued,
      quantityReturned: e.quantityReturned,
      netConsumption: e.quantityIssued - e.quantityReturned,
      pricedQuantity: e.pricedQuantity,
      pricedCost: e.pricedCost,
      soldValue: e.soldValue,
      marginAmount,
      marginPercent,
      unpricedQuantity: e.unpricedQuantity,
      unpricedCost: e.unpricedCost,
      totalRealCost: e.pricedCost + e.unpricedCost,
      byPurchaseOrder: [...e.byPurchaseOrder.values()].sort((a, b) => (a.purchaseOrderNumber || 0) - (b.purchaseOrderNumber || 0)),
    };
  }).sort((a, b) => a.materialName.localeCompare(b.materialName));

  const totals = materials.reduce((acc, m) => ({
    quantityIssued: acc.quantityIssued + m.quantityIssued,
    quantityReturned: acc.quantityReturned + m.quantityReturned,
    netConsumption: acc.netConsumption + m.netConsumption,
    pricedCost: acc.pricedCost + m.pricedCost,
    soldValue: acc.soldValue + m.soldValue,
    marginAmount: acc.marginAmount + m.marginAmount,
    unpricedCost: acc.unpricedCost + m.unpricedCost,
    totalRealCost: acc.totalRealCost + m.totalRealCost,
  }), {
    quantityIssued: 0, quantityReturned: 0, netConsumption: 0, pricedCost: 0, soldValue: 0, marginAmount: 0, unpricedCost: 0, totalRealCost: 0,
  });
  totals.marginPercent = totals.soldValue > 0 ? (totals.marginAmount / totals.soldValue) * 100 : null;

  return { project, materials, totals };
}

module.exports = { getContractAnalysis };
