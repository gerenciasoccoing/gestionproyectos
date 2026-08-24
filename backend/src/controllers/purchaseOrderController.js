const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  sequelize, PurchaseOrder, PurchaseOrderItem, PurchaseReceipt, Expense, ExpenseItem, BudgetItem, APU, Project, ThirdParty, User,
} = require('../models');
const {
  getOrderItemsWithDelivery, getItemWithDelivery, isOrderFullyDelivered, getPurchaseReport, nextOrderNumber,
  computeOrderTotals,
} = require('../services/purchaseOrderService');
const { generatePurchaseOrderPdf } = require('../services/pdfService');
const { getSettingsForPdf } = require('./companySettingsController');
const { assertCashBoxUsable, overdraftWarning } = require('../services/cashBoxService');

// Estos controladores atienden DOS montajes de ruta: el anidado en proyecto
// (/projects/:projectId/purchase-orders, ver purchaseOrderRoutes.js — comportamiento sin cambios)
// y el global (/purchase-orders, ver globalPurchaseOrderRoutes.js), usado desde la ficha de un
// proveedor para crear/gestionar una orden con proyecto opcional. Es la MISMA lógica en ambos
// casos: cuando la ruta trae :projectId se usa como filtro estricto (igual que antes); cuando no,
// se opera sobre la orden por su id sin esa restricción. Así no se duplica el modelo de negocio
// entre los dos puntos de entrada.

// projectId a validar contra la orden: el de la URL si la ruta es anidada, o el que ya tiene
// guardado la orden si es la ruta global (para no forzar mismatch cuando no aplica).
function scopeWhere(req) {
  const where = { id: req.params.id };
  if (req.params.projectId) where.projectId = req.params.projectId;
  return where;
}

const list = asyncHandler(async (req, res) => {
  const orders = await PurchaseOrder.findAll({
    where: { projectId: req.params.projectId },
    include: [{ model: PurchaseOrderItem, as: 'items', include: [{ model: PurchaseReceipt, as: 'receipts' }] }],
    order: [['date', 'DESC']],
  });
  res.json(orders);
});

// Listado global (ruta /purchase-orders, sin :projectId en la URL): usado tanto desde la ficha de
// un proveedor (pasando solo supplierId) como desde la página de Órdenes de Compra del menú
// principal (supplierId y/o projectId opcionales y combinables, o ninguno para ver todas). Mismo
// modelo/controlador que el listado anidado en proyecto (list, arriba) — no hay una tabla ni un
// flujo distinto por punto de entrada.
const listBySupplier = asyncHandler(async (req, res) => {
  const { supplierId, projectId } = req.query;
  const where = {};
  if (supplierId) where.supplierId = supplierId;
  if (projectId) where.projectId = projectId;
  const orders = await PurchaseOrder.findAll({
    where,
    include: [
      { model: PurchaseOrderItem, as: 'items', include: [{ model: PurchaseReceipt, as: 'receipts' }] },
      { model: Project, attributes: ['id', 'name'] },
    ],
    order: [['date', 'DESC']],
  });
  res.json(orders);
});

const get = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: scopeWhere(req), include: [{ model: Project, attributes: ['id', 'name'] }] });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  const items = await getOrderItemsWithDelivery(order.id);
  const totals = computeOrderTotals(items, order.retentionPercent);
  res.json({ ...order.toJSON(), items, totals });
});

const create = asyncHandler(async (req, res) => {
  const { supplier, supplierId, date, items = [], cashBoxId, retentionPercent } = req.body;
  // Ruta anidada: projectId siempre viene en la URL. Ruta global: opcional, en el body (la
  // orden puede quedar sin proyecto hasta que se le asigne uno).
  const projectId = req.params.projectId || req.body.projectId || null;

  if (!supplier || !date) throw new ApiError(400, 'supplier y date son obligatorios');
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'Debe incluir al menos un ítem');
  // La caja se elige UNA sola vez, a nivel de toda la orden (ver PurchaseOrder.cashBoxId): de ahí
  // sale el pago de cada recepción y del traslado a gastos, sin volver a preguntarla cada vez.
  await assertCashBoxUsable(cashBoxId);
  if (retentionPercent !== undefined && (Number(retentionPercent) < 0 || Number(retentionPercent) > 100)) {
    throw new ApiError(400, 'retentionPercent debe estar entre 0 y 100');
  }

  for (const it of items) {
    if (!it.name || !it.unit || it.quantityOrdered === undefined || it.unitPrice === undefined) {
      throw new ApiError(400, 'Cada ítem requiere name, unit, quantityOrdered y unitPrice');
    }
    if (Number(it.quantityOrdered) < 0 || Number(it.unitPrice) < 0) {
      throw new ApiError(400, 'Cantidad y precio unitario no pueden ser negativos');
    }
    if (it.vatPercent !== undefined && (Number(it.vatPercent) < 0 || Number(it.vatPercent) > 100)) {
      throw new ApiError(400, 'vatPercent debe estar entre 0 y 100');
    }
  }

  if (projectId && !req.user.isAdmin && !req.user.projectIds.includes(projectId)) {
    throw new ApiError(403, 'No tiene acceso a este proyecto');
  }

  // Vínculo opcional a ítems de presupuesto: solo tiene sentido si la orden tiene proyecto (el
  // presupuesto es por proyecto). Sin proyecto, se rechaza en vez de guardar un vínculo huérfano.
  const budgetItemIds = items.filter((it) => it.budgetItemId).map((it) => it.budgetItemId);
  if (budgetItemIds.length) {
    if (!projectId) throw new ApiError(400, 'No se puede vincular ítems de presupuesto sin asignar un proyecto a la orden');
    const linked = await BudgetItem.findAll({
      where: { id: budgetItemIds },
      include: [{ association: 'Budget' }],
    });
    const validIds = new Set(linked.filter((b) => b.Budget.projectId === projectId).map((b) => b.id));
    for (const id of budgetItemIds) {
      if (!validIds.has(id)) throw new ApiError(400, `El ítem de presupuesto ${id} no pertenece a este proyecto`);
    }
  }

  const order = await sequelize.transaction(async (t) => {
    const orderNumber = await nextOrderNumber(t);
    const created = await PurchaseOrder.create({
      projectId,
      orderNumber,
      supplier,
      supplierId: supplierId || null,
      date,
      status: 'abierta',
      createdBy: req.user.id,
      cashBoxId,
      retentionPercent: retentionPercent !== undefined ? retentionPercent : 0,
    }, { transaction: t });

    await PurchaseOrderItem.bulkCreate(
      items.map((it) => ({
        purchaseOrderId: created.id,
        budgetItemId: it.budgetItemId || null,
        name: it.name,
        unit: it.unit,
        quantityOrdered: it.quantityOrdered,
        unitPrice: it.unitPrice,
        totalValue: Number(it.quantityOrdered) * Number(it.unitPrice),
        vatPercent: it.vatPercent !== undefined ? it.vatPercent : 19,
      })),
      { transaction: t }
    );
    return created;
  });

  const items2 = await getOrderItemsWithDelivery(order.id);
  const totals = computeOrderTotals(items2, order.retentionPercent);
  res.status(201).json({ ...order.toJSON(), items: items2, totals });
});

// Edita un ítem existente (descripción/unidad/cantidad/valor unitario/vínculo a presupuesto).
// Bloqueado si la orden está cerrada o ya se convirtió a gasto (ese gasto quedaría desactualizado),
// y no permite bajar la cantidad ordenada por debajo de lo ya entregado.
const updateItem = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: scopeWhere(req) });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (order.status === 'cerrada' || order.status === 'cerrada_con_faltantes') {
    throw new ApiError(400, 'No se pueden editar ítems de una orden cerrada');
  }
  if (order.expenseId) {
    throw new ApiError(400, 'No se pueden editar ítems de una orden ya trasladada a gastos');
  }

  const item = await PurchaseOrderItem.findOne({ where: { id: req.params.itemId, purchaseOrderId: order.id } });
  if (!item) throw new ApiError(404, 'Ítem de orden de compra no encontrado');

  const { name, unit, quantityOrdered, unitPrice, budgetItemId, vatPercent } = req.body;
  const nextQuantity = quantityOrdered !== undefined ? Number(quantityOrdered) : Number(item.quantityOrdered);
  const nextUnitPrice = unitPrice !== undefined ? Number(unitPrice) : Number(item.unitPrice);
  if (nextQuantity < 0 || nextUnitPrice < 0) throw new ApiError(400, 'Cantidad y precio unitario no pueden ser negativos');
  if (vatPercent !== undefined && (Number(vatPercent) < 0 || Number(vatPercent) > 100)) {
    throw new ApiError(400, 'vatPercent debe estar entre 0 y 100');
  }

  const { delivered } = await getItemWithDelivery(item.id);
  if (nextQuantity < delivered) {
    throw new ApiError(400, `La cantidad ordenada (${nextQuantity}) no puede ser menor a la cantidad ya entregada (${delivered})`);
  }

  if (budgetItemId !== undefined) {
    if (budgetItemId) {
      if (!order.projectId) throw new ApiError(400, 'No se puede vincular ítems de presupuesto sin asignar un proyecto a la orden');
      const linked = await BudgetItem.findByPk(budgetItemId, { include: [{ association: 'Budget' }] });
      if (!linked || linked.Budget.projectId !== order.projectId) {
        throw new ApiError(400, `El ítem de presupuesto ${budgetItemId} no pertenece a este proyecto`);
      }
    }
    item.budgetItemId = budgetItemId || null;
  }
  if (name !== undefined) item.name = name;
  if (unit !== undefined) item.unit = unit;
  if (quantityOrdered !== undefined) item.quantityOrdered = quantityOrdered;
  if (unitPrice !== undefined) item.unitPrice = unitPrice;
  if (vatPercent !== undefined) item.vatPercent = vatPercent;
  item.totalValue = nextQuantity * nextUnitPrice;
  await item.save();

  const items = await getOrderItemsWithDelivery(order.id);
  const totals = computeOrderTotals(items, order.retentionPercent);
  res.json({ ...order.toJSON(), items, totals });
});

// Edita la orden completa: cabecera (proveedor, fecha, proyecto, caja, % retención) e ítems
// (cambiar cantidad/valor/IVA, agregar nuevos, quitar existentes) en una sola operación. Bloqueada
// por completo si la orden está cerrada (con o sin faltantes): una orden cerrada es un registro
// terminado del ciclo de recepción, y ya pudo haber afectado caja/entregas — no se permite tocarla
// ni en cabecera ni en ítems (si hace falta corregir algo ahí, es un caso de soporte, no de
// autoservicio). cashBoxId solo puede cambiarse si la orden TODAVÍA no generó ningún gasto real (ni
// recepciones ni traslado a gastos): una vez que el dinero ya salió de una caja, cambiar este campo
// después haría que la orden mostrara una caja distinta a la que realmente se usó en esos gastos
// históricos (los gastos ya registrados no se tocan ni se mueven de caja retroactivamente).
//
// `items` es OPCIONAL: si no viene, solo se tocan los campos de cabecera (comportamiento anterior).
// Si viene, es la lista COMPLETA deseada de ítems: los que traen `id` son ítems existentes que se
// actualizan, los que no traen `id` son ítems nuevos, y cualquier ítem existente que no aparezca en
// la lista se elimina — con dos resguardos: no se puede bajar la cantidad de un ítem por debajo de
// lo ya entregado, y no se puede eliminar un ítem que ya tiene entregas registradas (esas entregas
// ya generaron su propio gasto histórico, que no se reescribe). Si la orden ya se convirtió a un
// gasto único (order.expenseId, ver convertToExpense), ese gasto se recalcula en la misma
// transacción para reflejar el nuevo total — así nunca queda desincronizado.
const updateOrder = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({
    where: scopeWhere(req),
    include: [{ model: PurchaseOrderItem, as: 'items', include: [{ model: PurchaseReceipt, as: 'receipts' }] }],
  });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (order.status === 'cerrada' || order.status === 'cerrada_con_faltantes') {
    throw new ApiError(400, 'No se puede editar una orden cerrada');
  }

  const { supplier, supplierId, date, projectId, cashBoxId, retentionPercent, items } = req.body;
  const nextProjectId = projectId !== undefined ? (projectId || null) : order.projectId;

  if (projectId && projectId !== order.projectId && !req.user.isAdmin && !req.user.projectIds.includes(projectId)) {
    throw new ApiError(403, 'No tiene acceso a este proyecto');
  }

  if (cashBoxId !== undefined && cashBoxId !== order.cashBoxId) {
    const itemIds = order.items.map((it) => it.id);
    const hasMoneyMovement = Boolean(order.expenseId)
      || (itemIds.length > 0 && (await PurchaseReceipt.count({ where: { purchaseOrderItemId: itemIds } })) > 0);
    if (hasMoneyMovement) {
      throw new ApiError(400, 'Esta orden ya generó gastos con la caja actual; no se puede cambiar la caja de una orden con movimientos. Los gastos ya registrados no se ven afectados por este cambio.');
    }
    await assertCashBoxUsable(cashBoxId);
    order.cashBoxId = cashBoxId;
  }
  if (supplier !== undefined) order.supplier = supplier;
  if (supplierId !== undefined) order.supplierId = supplierId || null;
  if (date !== undefined) order.date = date;
  if (projectId !== undefined) order.projectId = nextProjectId;
  if (retentionPercent !== undefined) {
    if (Number(retentionPercent) < 0 || Number(retentionPercent) > 100) throw new ApiError(400, 'retentionPercent debe estar entre 0 y 100');
    order.retentionPercent = retentionPercent;
  }

  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'La orden debe tener al menos un ítem');
    for (const it of items) {
      if (!it.name || !it.unit || it.quantityOrdered === undefined || it.unitPrice === undefined) {
        throw new ApiError(400, 'Cada ítem requiere name, unit, quantityOrdered y unitPrice');
      }
      if (Number(it.quantityOrdered) < 0 || Number(it.unitPrice) < 0) {
        throw new ApiError(400, 'Cantidad y precio unitario no pueden ser negativos');
      }
      if (it.vatPercent !== undefined && (Number(it.vatPercent) < 0 || Number(it.vatPercent) > 100)) {
        throw new ApiError(400, 'vatPercent debe estar entre 0 y 100');
      }
    }
    const budgetItemIds = items.filter((it) => it.budgetItemId).map((it) => it.budgetItemId);
    if (budgetItemIds.length) {
      if (!nextProjectId) throw new ApiError(400, 'No se puede vincular ítems de presupuesto sin asignar un proyecto a la orden');
      const linked = await BudgetItem.findAll({ where: { id: budgetItemIds }, include: [{ association: 'Budget' }] });
      const validIds = new Set(linked.filter((b) => b.Budget.projectId === nextProjectId).map((b) => b.id));
      for (const id of budgetItemIds) {
        if (!validIds.has(id)) throw new ApiError(400, `El ítem de presupuesto ${id} no pertenece a este proyecto`);
      }
    }

    await sequelize.transaction(async (t) => {
      const existingById = new Map(order.items.map((it) => [it.id, it]));
      const submittedIds = new Set(items.filter((it) => it.id).map((it) => it.id));

      for (const existing of order.items) {
        if (submittedIds.has(existing.id)) continue;
        const delivered = existing.receipts.reduce((s, r) => s + Number(r.quantityReceived), 0);
        if (delivered > 0) {
          throw new ApiError(400, `No se puede quitar el ítem "${existing.name}": ya tiene entregas registradas.`);
        }
        await existing.destroy({ transaction: t });
      }

      for (const it of items) {
        const nextQuantity = Number(it.quantityOrdered);
        const nextUnitPrice = Number(it.unitPrice);
        const totalValue = nextQuantity * nextUnitPrice;
        if (it.id && existingById.has(it.id)) {
          const existing = existingById.get(it.id);
          const delivered = existing.receipts.reduce((s, r) => s + Number(r.quantityReceived), 0);
          if (nextQuantity < delivered) {
            throw new ApiError(400, `La cantidad de "${it.name}" (${nextQuantity}) no puede ser menor a la ya entregada (${delivered})`);
          }
          existing.name = it.name;
          existing.unit = it.unit;
          existing.quantityOrdered = it.quantityOrdered;
          existing.unitPrice = it.unitPrice;
          existing.vatPercent = it.vatPercent !== undefined ? it.vatPercent : existing.vatPercent;
          existing.budgetItemId = it.budgetItemId || null;
          existing.totalValue = totalValue;
          await existing.save({ transaction: t });
        } else {
          await PurchaseOrderItem.create({
            purchaseOrderId: order.id,
            budgetItemId: it.budgetItemId || null,
            name: it.name,
            unit: it.unit,
            quantityOrdered: it.quantityOrdered,
            unitPrice: it.unitPrice,
            totalValue,
            vatPercent: it.vatPercent !== undefined ? it.vatPercent : 19,
          }, { transaction: t });
        }
      }

      if (order.expenseId) {
        const freshItems = await PurchaseOrderItem.findAll({ where: { purchaseOrderId: order.id }, transaction: t });
        const newTotals = computeOrderTotals(freshItems, order.retentionPercent);
        await Expense.update({ amount: newTotals.grandTotal }, { where: { id: order.expenseId }, transaction: t });
        await ExpenseItem.destroy({ where: { expenseId: order.expenseId }, transaction: t });
        await ExpenseItem.bulkCreate(freshItems.map((it) => ({
          expenseId: order.expenseId,
          description: it.name,
          quantity: it.quantityOrdered,
          unitPrice: it.unitPrice,
          totalPrice: it.totalValue,
        })), { transaction: t });
      }

      await order.save({ transaction: t });
    });
  } else {
    await order.save();
  }

  const freshItems = await getOrderItemsWithDelivery(order.id);
  const totals = computeOrderTotals(freshItems, order.retentionPercent);
  res.json({ ...order.toJSON(), items: freshItems, totals });
});

// Elimina la orden completa (sus ítems se borran en cascada). Bloqueada si ya generó cualquier
// gasto real (traslado a gastos o alguna recepción registrada): borrar la orden no revierte esos
// gastos ni el saldo que ya salió de la caja — quedarían huérfanos, sin la orden que los originó,
// mientras el dinero ya se movió. Hay que resolver esos gastos desde el módulo de Gastos primero.
const remove = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: scopeWhere(req), include: [{ model: PurchaseOrderItem, as: 'items' }] });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');

  if (order.expenseId) {
    throw new ApiError(400, 'Esta orden ya fue trasladada a un gasto. Elimina o reversa ese gasto desde el módulo de Gastos antes de eliminar la orden.');
  }
  const itemIds = order.items.map((it) => it.id);
  const receiptCount = itemIds.length ? await PurchaseReceipt.count({ where: { purchaseOrderItemId: itemIds } }) : 0;
  if (receiptCount > 0) {
    throw new ApiError(400, 'Esta orden ya tiene recepciones registradas, cada una con su propio gasto. Elimina esos gastos desde el módulo de Gastos antes de eliminar la orden.');
  }

  await order.destroy();
  res.status(204).end();
});

// Traslada todos los ítems de la orden a un gasto del proyecto (trazable por sourceId = orden de
// compra), en una sola operación. No duplica: si la orden ya fue trasladada (expenseId asignado),
// se rechaza. Los ítems y montos del gasto quedan idénticos a los de la orden en el momento de la
// conversión (por eso updateItem se bloquea después de convertir). Requiere proyecto asignado: un
// gasto siempre pertenece a un proyecto.
const convertToExpense = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({
    where: scopeWhere(req),
    include: [{ model: PurchaseOrderItem, as: 'items' }],
  });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (!order.projectId) throw new ApiError(400, 'Esta orden no tiene un proyecto asignado. Asígnale un proyecto antes de trasladarla a gastos.');
  if (order.expenseId) throw new ApiError(400, 'Esta orden de compra ya fue trasladada a gastos');
  if (!order.items.length) throw new ApiError(400, 'La orden no tiene ítems para trasladar');
  // La caja ya no se elige acá: es la que se fijó una sola vez al crear la orden (ver
  // PurchaseOrder.cashBoxId). Una orden migrada de antes de este cambio, cuyo historial mezcló más
  // de una caja entre sus ítems, queda sin cashBoxId hasta que alguien se la asigne a mano
  // (updateOrder) — no se le puede adivinar cuál usar.
  if (!order.cashBoxId) {
    throw new ApiError(400, 'Esta orden no tiene una caja asignada. Edítala para asignarle una antes de trasladarla a gastos.');
  }
  const cashBoxId = order.cashBoxId;

  const { category, date } = req.body;
  const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
  const expenseCategory = category && CATEGORIES.includes(category) ? category : 'materiales';
  const expenseDate = date || order.date;

  const { subtotal: subtotalAmount, vatTotal, retentionAmount } = computeOrderTotals(order.items, order.retentionPercent);
  const totalAmount = subtotalAmount + vatTotal - retentionAmount;

  const { expense, warning } = await sequelize.transaction(async (t) => {
    await assertCashBoxUsable(cashBoxId, { transaction: t });
    const created = await Expense.create({
      projectId: order.projectId,
      cashBoxId,
      supplierId: order.supplierId,
      category: expenseCategory,
      amount: totalAmount,
      date: expenseDate,
      description: `Orden de compra a ${order.supplier}`,
      vendorName: order.supplier,
      source: 'purchase_order',
      sourceId: order.id,
      createdBy: req.user.id,
    }, { transaction: t });

    await ExpenseItem.bulkCreate(
      order.items.map((it) => ({
        expenseId: created.id,
        description: it.name,
        quantity: it.quantityOrdered,
        unitPrice: it.unitPrice,
        totalPrice: it.totalValue,
      })),
      { transaction: t }
    );

    order.expenseId = created.id;
    await order.save({ transaction: t });

    const w = await overdraftWarning(cashBoxId, { transaction: t });
    return { expense: created, warning: w };
  });

  const full = await Expense.findByPk(expense.id, { include: [{ model: ExpenseItem, as: 'items' }] });
  res.status(201).json({ ...full.toJSON(), warning });
});

// Registra una recepción (total o parcial) y genera automáticamente el gasto en la categoría
// "materiales". Requiere proyecto asignado por la misma razón que convertToExpense.
const addReceipt = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: scopeWhere(req) });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (!order.projectId) throw new ApiError(400, 'Esta orden no tiene un proyecto asignado. Asígnale un proyecto antes de registrar entregas.');
  if (order.status === 'cerrada' || order.status === 'cerrada_con_faltantes') {
    throw new ApiError(400, 'No se pueden registrar recepciones en una orden cerrada');
  }

  const item = await PurchaseOrderItem.findOne({ where: { id: req.params.itemId, purchaseOrderId: order.id } });
  if (!item) throw new ApiError(404, 'Ítem de orden de compra no encontrado');

  const { date, quantityReceived, notes } = req.body;
  if (!date || quantityReceived === undefined) throw new ApiError(400, 'date y quantityReceived son obligatorios');
  if (Number(quantityReceived) < 0) throw new ApiError(400, 'La cantidad recibida no puede ser negativa');
  // Misma caja para toda la orden (ver comentario en convertToExpense): ya no se vuelve a
  // preguntar en cada recepción.
  if (!order.cashBoxId) {
    throw new ApiError(400, 'Esta orden no tiene una caja asignada. Edítala para asignarle una antes de registrar recepciones.');
  }
  const cashBoxId = order.cashBoxId;

  const existingReceipts = await PurchaseReceipt.findAll({ where: { purchaseOrderItemId: item.id } });
  const deliveredBefore = existingReceipts.reduce((sum, r) => sum + Number(r.quantityReceived), 0);
  const deliveredAfter = deliveredBefore + Number(quantityReceived);
  const warning = deliveredAfter > Number(item.quantityOrdered)
    ? `La cantidad entregada acumulada (${deliveredAfter}) supera la cantidad ordenada (${item.quantityOrdered}).`
    : null;

  const { receipt, expense, cashBoxWarning } = await sequelize.transaction(async (t) => {
    await assertCashBoxUsable(cashBoxId, { transaction: t });
    const expenseCreated = await Expense.create({
      projectId: order.projectId,
      cashBoxId,
      supplierId: order.supplierId,
      category: 'materiales',
      amount: Number(quantityReceived) * Number(item.unitPrice),
      date,
      description: `Recepción de "${item.name}" - orden de compra ${order.id}`,
      source: 'purchase_receipt',
      sourceId: null,
      createdBy: req.user.id,
    }, { transaction: t });

    const receiptCreated = await PurchaseReceipt.create({
      purchaseOrderItemId: item.id,
      date,
      quantityReceived,
      notes,
      expenseId: expenseCreated.id,
      createdBy: req.user.id,
    }, { transaction: t });

    expenseCreated.sourceId = receiptCreated.id;
    await expenseCreated.save({ transaction: t });

    if (order.status === 'abierta') {
      order.status = 'parcial';
      await order.save({ transaction: t });
    }

    const cbWarning = await overdraftWarning(cashBoxId, { transaction: t });
    return { receipt: receiptCreated, expense: expenseCreated, cashBoxWarning: cbWarning };
  });

  res.status(201).json({ receipt, expense, warning, cashBoxWarning });
});

// Cierre normal (todo entregado) o cierre con faltantes justificados (requiere closureReason).
// No requiere proyecto: una orden sin proyecto también puede cerrarse (con o sin faltantes),
// simplemente nunca tuvo recepciones que registrar delivery.
const close = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: scopeWhere(req) });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (order.status === 'cerrada' || order.status === 'cerrada_con_faltantes') {
    throw new ApiError(400, 'La orden ya está cerrada');
  }

  const fullyDelivered = await isOrderFullyDelivered(order.id);
  const { closureReason } = req.body;

  if (fullyDelivered) {
    order.status = 'cerrada';
  } else {
    if (!closureReason || !closureReason.trim()) {
      throw new ApiError(400, 'Hay ítems pendientes por entregar: debe indicar un motivo (closureReason) para el cierre con faltantes');
    }
    order.status = 'cerrada_con_faltantes';
    order.closureReason = closureReason;
  }
  await order.save();
  const items = await getOrderItemsWithDelivery(order.id);
  res.json({ ...order.toJSON(), items });
});

// Reporte consolidado de compras: por proyecto y/o rango de fechas (basado en fecha de recepción).
const report = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const data = await getPurchaseReport(req.params.projectId, { from, to });
  res.json(data);
});

// Exporta la orden en PDF (ver services/pdfService.js#generatePurchaseOrderPdf). Disponible desde
// ambos montajes de ruta. lang (query, 'es'|'en') sigue el idioma activo del usuario en la app.
// El PDF se le entrega al proveedor, así que no se incluye el proyecto ni el cliente final al que
// está destinada la compra (ver generatePurchaseOrderPdf): ya no hace falta traer el Project acá.
const exportPdf = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({
    where: scopeWhere(req),
    include: [
      { model: ThirdParty, as: 'supplierParty' },
    ],
  });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');

  const items = await PurchaseOrderItem.findAll({
    where: { purchaseOrderId: order.id },
    include: [
      { model: PurchaseReceipt, as: 'receipts' },
      { model: BudgetItem, include: [{ model: APU, attributes: ['code'] }] },
    ],
  });
  const itemsWithDelivery = items.map((item) => {
    const delivered = item.receipts.reduce((sum, r) => sum + Number(r.quantityReceived), 0);
    return {
      ...item.toJSON(),
      delivered,
      code: item.BudgetItem?.APU?.code || null,
    };
  });

  const company = await getSettingsForPdf();
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  const totals = computeOrderTotals(itemsWithDelivery, order.retentionPercent);
  // "Elaboró" es quien generó la orden (order.createdBy), no necesariamente quien exporta el PDF
  // ahora (otro usuario con acceso puede reimprimirla más tarde).
  const preparer = order.createdBy ? await User.findByPk(order.createdBy) : null;
  const preparedByName = preparer?.name || null;

  const doc = generatePurchaseOrderPdf({ order, items: itemsWithDelivery, company, lang, totals, preparedByName });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="orden-compra-${order.orderNumber || order.id}.pdf"`);
  doc.pipe(res);
});

module.exports = {
  list, listBySupplier, get, create, updateOrder, remove, updateItem, convertToExpense, addReceipt, close, report, exportPdf,
};
