const { Op } = require('sequelize');
const {
  sequelize, MarketStudy, MarketStudyQuotation, MarketStudyQuotationItem, PurchaseOrder, PurchaseOrderItem, PriceItem, PriceHistory,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { assertCashBoxUsable } = require('./cashBoxService');
const { nextOrderNumber } = require('./purchaseOrderService');
const { contractPrefixForProject } = require('./numberingService');

// Matriz comparativa: agrupa los ítems de TODAS las cotizaciones del estudio por groupKey (ver
// MarketStudyQuotationItem) y, dentro de cada grupo, señala el precio unitario más bajo. También
// arma, por proveedor, el total de lo que sí cotizó (nunca se rellena con 0 lo que un proveedor no
// cotizó: eso inflaría artificialmente la comparación).
//
// El único criterio de recomendación hoy es precio más bajo (por ítem y total por proveedor) — ver
// tarea. bestSupplierIds puede traer más de un id si hay empate exacto. Diseñado para que agregar
// un futuro criterio ponderable (ej. tiempo de entrega) sea sumar un campo más al resultado de cada
// grupo, sin rehacer esta función.
function buildComparison(study) {
  const suppliersById = new Map();
  for (const q of study.quotations) {
    suppliersById.set(q.id, {
      quotationId: q.id,
      supplierId: q.supplierId,
      supplierName: q.supplierParty?.name || q.supplierNameRaw,
      deliveryTime: q.deliveryTime,
      validUntil: q.validUntil,
      paymentTerms: q.paymentTerms,
      extractionStatus: q.extractionStatus,
      total: 0,
      itemCount: 0,
    });
  }

  const groups = new Map(); // groupKey -> { groupKey, name, unit, offers: [...] }
  for (const q of study.quotations) {
    for (const it of q.items) {
      if (!groups.has(it.groupKey)) {
        groups.set(it.groupKey, { groupKey: it.groupKey, name: it.name, unit: it.unit, offers: [] });
      }
      const group = groups.get(it.groupKey);
      group.offers.push({
        itemId: it.id,
        quotationId: q.id,
        supplierId: q.supplierId,
        supplierName: q.supplierParty?.name || q.supplierNameRaw,
        quantity: it.quantity != null ? Number(it.quantity) : null,
        unit: it.unit,
        unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
        totalPrice: it.totalPrice != null ? Number(it.totalPrice) : null,
        needsReview: it.needsReview,
      });
      if (it.totalPrice != null) {
        const supplierTotals = suppliersById.get(q.id);
        supplierTotals.total += Number(it.totalPrice);
        supplierTotals.itemCount += 1;
      }
    }
  }

  const groupList = [...groups.values()].map((group) => {
    const priced = group.offers.filter((o) => o.unitPrice != null);
    const bestUnitPrice = priced.length ? Math.min(...priced.map((o) => o.unitPrice)) : null;
    const bestSupplierIds = bestUnitPrice == null ? [] : priced.filter((o) => o.unitPrice === bestUnitPrice).map((o) => o.quotationId);
    return { ...group, bestUnitPrice, bestQuotationIds: bestSupplierIds };
  });

  const supplierTotals = [...suppliersById.values()];
  const totalsWithOffer = supplierTotals.filter((s) => s.itemCount > 0);
  const bestTotal = totalsWithOffer.length ? Math.min(...totalsWithOffer.map((s) => s.total)) : null;
  const bestTotalQuotationIds = bestTotal == null ? [] : totalsWithOffer.filter((s) => s.total === bestTotal).map((s) => s.quotationId);

  // Sugerencia de compra dividida: si el proveedor con mejor precio no es el MISMO en todos los
  // grupos, se lo muestra como sugerencia — nunca se genera nada automáticamente a partir de esto
  // (ver generateDraftOrders, que siempre requiere una decisión explícita del usuario).
  const distinctBestSuppliers = new Set(groupList.flatMap((g) => g.bestQuotationIds));
  const isSplitRecommended = distinctBestSuppliers.size > 1;

  return {
    groups: groupList,
    suppliers: supplierTotals,
    recommendation: {
      reason: 'precio_mas_bajo',
      bestTotalQuotationIds,
      isSplitRecommended,
      splitByGroup: isSplitRecommended
        ? groupList.map((g) => ({ groupKey: g.groupKey, name: g.name, bestQuotationIds: g.bestQuotationIds }))
        : [],
    },
  };
}

// Genera uno o más borradores de Orden de Compra (uno por entrada de `drafts`), reusando
// PurchaseOrder/PurchaseOrderItem tal cual (misma numeración, mismo cálculo de contractPrefix) —
// solo que con approvalState:'pendiente_aprobacion' en vez del flujo normal. Cada entrada de
// `drafts` es { supplierId, supplierName, cashBoxId, date, retentionPercent, itemIds } donde
// itemIds son MarketStudyQuotationItem.id elegidos para ESA orden (el usuario decide manualmente
// cómo repartirlos entre proveedores si divide la compra). Nunca queda "cerrada" ni genera un
// gasto: eso solo pasa después de aprobarla (ver purchaseOrderController.approve).
async function generateDraftOrders(study, drafts, { userId, decisionNotes }) {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw new ApiError(400, 'Debe indicar al menos un borrador de orden a generar');
  }

  const allQuotationItems = await MarketStudyQuotationItem.findAll({
    include: [{ model: MarketStudyQuotation, where: { marketStudyId: study.id }, required: true }],
  });
  const itemsById = new Map(allQuotationItems.map((it) => [it.id, it]));

  const createdOrders = await sequelize.transaction(async (t) => {
    const orders = [];
    for (const draft of drafts) {
      const { supplierId, supplierName, cashBoxId, date, retentionPercent, itemIds } = draft;
      if (!supplierName || !supplierName.trim()) throw new ApiError(400, 'Cada borrador requiere el nombre del proveedor');
      if (!date) throw new ApiError(400, 'Cada borrador requiere una fecha');
      if (!Array.isArray(itemIds) || itemIds.length === 0) throw new ApiError(400, 'Cada borrador requiere al menos un ítem');
      await assertCashBoxUsable(cashBoxId, { transaction: t });

      const chosenItems = itemIds.map((id) => {
        const item = itemsById.get(id);
        if (!item) throw new ApiError(400, `El ítem ${id} no pertenece a este estudio de mercado`);
        return item;
      });

      const orderNumber = await nextOrderNumber(t);
      const contractPrefix = await contractPrefixForProject(study.projectId, t);
      const order = await PurchaseOrder.create({
        projectId: study.projectId,
        orderNumber,
        supplier: supplierName.trim(),
        supplierId: supplierId || null,
        date,
        status: 'abierta',
        approvalState: 'pendiente_aprobacion',
        marketStudyId: study.id,
        createdBy: userId,
        cashBoxId,
        retentionPercent: retentionPercent !== undefined && retentionPercent !== '' ? Number(retentionPercent) : 0,
        contractPrefix,
      }, { transaction: t });

      await PurchaseOrderItem.bulkCreate(
        chosenItems.map((it) => ({
          purchaseOrderId: order.id,
          name: it.name,
          unit: it.unit || 'un',
          quantityOrdered: it.quantity || 0,
          unitPrice: it.unitPrice || 0,
          totalValue: Number(it.quantity || 0) * Number(it.unitPrice || 0),
          vatPercent: 19,
        })),
        { transaction: t },
      );

      orders.push(order);
    }

    study.status = 'decidida';
    study.decidedAt = new Date();
    if (decisionNotes !== undefined) study.decisionNotes = decisionNotes;
    await study.save({ transaction: t });

    return orders;
  });

  // Retroalimentación a la Base de Precios: best-effort, sin bloquear la creación de las órdenes
  // si algo falla acá. Solo actualiza un PriceItem que YA exista con nombre+unidad iguales (sin
  // acentos/mayúsculas) — nunca crea un ítem de catálogo nuevo a partir de una cotización.
  try {
    await feedPriceBase(drafts.flatMap((d) => d.itemIds.map((id) => itemsById.get(id)).filter(Boolean)), new Date());
  } catch (err) {
    console.error('[marketStudyService] No se pudo retroalimentar la Base de Precios:', err.message);
  }

  return createdOrders;
}

async function feedPriceBase(quotationItems, effectiveDate) {
  for (const it of quotationItems) {
    if (!it.unit || it.unitPrice == null) continue;
    const match = await PriceItem.findOne({
      where: {
        name: { [Op.iLike]: it.name.trim() },
        unit: { [Op.iLike]: it.unit.trim() },
      },
    });
    if (!match) continue;
    await PriceHistory.create({
      priceItemId: match.id,
      value: it.unitPrice,
      effectiveDate: effectiveDate.toISOString().slice(0, 10),
    });
  }
}

module.exports = { buildComparison, generateDraftOrders, feedPriceBase };
