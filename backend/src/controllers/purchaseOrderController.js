const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  sequelize, PurchaseOrder, PurchaseOrderItem, PurchaseReceipt, Expense, ExpenseItem, BudgetItem,
} = require('../models');
const {
  getOrderItemsWithDelivery, getItemWithDelivery, isOrderFullyDelivered, getPurchaseReport,
} = require('../services/purchaseOrderService');

const list = asyncHandler(async (req, res) => {
  const orders = await PurchaseOrder.findAll({
    where: { projectId: req.params.projectId },
    include: [{ model: PurchaseOrderItem, as: 'items', include: [{ model: PurchaseReceipt, as: 'receipts' }] }],
    order: [['date', 'DESC']],
  });
  res.json(orders);
});

const get = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  const items = await getOrderItemsWithDelivery(order.id);
  res.json({ ...order.toJSON(), items });
});

const create = asyncHandler(async (req, res) => {
  const { supplier, supplierId, date, items = [] } = req.body;
  if (!supplier || !date) throw new ApiError(400, 'supplier y date son obligatorios');
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'Debe incluir al menos un ítem');

  for (const it of items) {
    if (!it.name || !it.unit || it.quantityOrdered === undefined || it.unitPrice === undefined) {
      throw new ApiError(400, 'Cada ítem requiere name, unit, quantityOrdered y unitPrice');
    }
    if (Number(it.quantityOrdered) < 0 || Number(it.unitPrice) < 0) {
      throw new ApiError(400, 'Cantidad y precio unitario no pueden ser negativos');
    }
  }

  // Validar vínculo opcional a ítems de presupuesto del mismo proyecto.
  const budgetItemIds = items.filter((it) => it.budgetItemId).map((it) => it.budgetItemId);
  if (budgetItemIds.length) {
    const linked = await BudgetItem.findAll({
      where: { id: budgetItemIds },
      include: [{ association: 'Budget' }],
    });
    const validIds = new Set(linked.filter((b) => b.Budget.projectId === req.params.projectId).map((b) => b.id));
    for (const id of budgetItemIds) {
      if (!validIds.has(id)) throw new ApiError(400, `El ítem de presupuesto ${id} no pertenece a este proyecto`);
    }
  }

  const order = await sequelize.transaction(async (t) => {
    const created = await PurchaseOrder.create({
      projectId: req.params.projectId,
      supplier,
      supplierId: supplierId || null,
      date,
      status: 'abierta',
      createdBy: req.user.id,
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
      })),
      { transaction: t }
    );
    return created;
  });

  const items2 = await getOrderItemsWithDelivery(order.id);
  res.status(201).json({ ...order.toJSON(), items: items2 });
});

// Edita un ítem existente (descripción/unidad/cantidad/valor unitario/vínculo a presupuesto).
// Bloqueado si la orden está cerrada o ya se convirtió a gasto (ese gasto quedaría desactualizado),
// y no permite bajar la cantidad ordenada por debajo de lo ya entregado.
const updateItem = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (order.status === 'cerrada' || order.status === 'cerrada_con_faltantes') {
    throw new ApiError(400, 'No se pueden editar ítems de una orden cerrada');
  }
  if (order.expenseId) {
    throw new ApiError(400, 'No se pueden editar ítems de una orden ya trasladada a gastos');
  }

  const item = await PurchaseOrderItem.findOne({ where: { id: req.params.itemId, purchaseOrderId: order.id } });
  if (!item) throw new ApiError(404, 'Ítem de orden de compra no encontrado');

  const { name, unit, quantityOrdered, unitPrice, budgetItemId } = req.body;
  const nextQuantity = quantityOrdered !== undefined ? Number(quantityOrdered) : Number(item.quantityOrdered);
  const nextUnitPrice = unitPrice !== undefined ? Number(unitPrice) : Number(item.unitPrice);
  if (nextQuantity < 0 || nextUnitPrice < 0) throw new ApiError(400, 'Cantidad y precio unitario no pueden ser negativos');

  const { delivered } = await getItemWithDelivery(item.id);
  if (nextQuantity < delivered) {
    throw new ApiError(400, `La cantidad ordenada (${nextQuantity}) no puede ser menor a la cantidad ya entregada (${delivered})`);
  }

  if (budgetItemId !== undefined) {
    if (budgetItemId) {
      const linked = await BudgetItem.findByPk(budgetItemId, { include: [{ association: 'Budget' }] });
      if (!linked || linked.Budget.projectId !== req.params.projectId) {
        throw new ApiError(400, `El ítem de presupuesto ${budgetItemId} no pertenece a este proyecto`);
      }
    }
    item.budgetItemId = budgetItemId || null;
  }
  if (name !== undefined) item.name = name;
  if (unit !== undefined) item.unit = unit;
  if (quantityOrdered !== undefined) item.quantityOrdered = quantityOrdered;
  if (unitPrice !== undefined) item.unitPrice = unitPrice;
  item.totalValue = nextQuantity * nextUnitPrice;
  await item.save();

  const items = await getOrderItemsWithDelivery(order.id);
  res.json({ ...order.toJSON(), items });
});

// Traslada todos los ítems de la orden a un gasto del proyecto (trazable por sourceId = orden de
// compra), en una sola operación. No duplica: si la orden ya fue trasladada (expenseId asignado),
// se rechaza. Los ítems y montos del gasto quedan idénticos a los de la orden en el momento de la
// conversión (por eso updateItem se bloquea después de convertir).
const convertToExpense = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({
    where: { id: req.params.id, projectId: req.params.projectId },
    include: [{ model: PurchaseOrderItem, as: 'items' }],
  });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (order.expenseId) throw new ApiError(400, 'Esta orden de compra ya fue trasladada a gastos');
  if (!order.items.length) throw new ApiError(400, 'La orden no tiene ítems para trasladar');

  const { category, date } = req.body;
  const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
  const expenseCategory = category && CATEGORIES.includes(category) ? category : 'materiales';
  const expenseDate = date || order.date;

  const totalAmount = order.items.reduce((s, it) => s + Number(it.totalValue), 0);

  const expense = await sequelize.transaction(async (t) => {
    const created = await Expense.create({
      projectId: req.params.projectId,
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

    return created;
  });

  const full = await Expense.findByPk(expense.id, { include: [{ model: ExpenseItem, as: 'items' }] });
  res.status(201).json(full);
});

// Registra una recepción (total o parcial) y genera automáticamente el gasto en la categoría "materiales".
const addReceipt = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!order) throw new ApiError(404, 'Orden de compra no encontrada');
  if (order.status === 'cerrada' || order.status === 'cerrada_con_faltantes') {
    throw new ApiError(400, 'No se pueden registrar recepciones en una orden cerrada');
  }

  const item = await PurchaseOrderItem.findOne({ where: { id: req.params.itemId, purchaseOrderId: order.id } });
  if (!item) throw new ApiError(404, 'Ítem de orden de compra no encontrado');

  const { date, quantityReceived, notes } = req.body;
  if (!date || quantityReceived === undefined) throw new ApiError(400, 'date y quantityReceived son obligatorios');
  if (Number(quantityReceived) < 0) throw new ApiError(400, 'La cantidad recibida no puede ser negativa');

  const existingReceipts = await PurchaseReceipt.findAll({ where: { purchaseOrderItemId: item.id } });
  const deliveredBefore = existingReceipts.reduce((sum, r) => sum + Number(r.quantityReceived), 0);
  const deliveredAfter = deliveredBefore + Number(quantityReceived);
  const warning = deliveredAfter > Number(item.quantityOrdered)
    ? `La cantidad entregada acumulada (${deliveredAfter}) supera la cantidad ordenada (${item.quantityOrdered}).`
    : null;

  const { receipt, expense } = await sequelize.transaction(async (t) => {
    const expenseCreated = await Expense.create({
      projectId: req.params.projectId,
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

    return { receipt: receiptCreated, expense: expenseCreated };
  });

  res.status(201).json({ receipt, expense, warning });
});

// Cierre normal (todo entregado) o cierre con faltantes justificados (requiere closureReason).
const close = asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
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

module.exports = {
  list, get, create, updateItem, convertToExpense, addReceipt, close, report,
};
