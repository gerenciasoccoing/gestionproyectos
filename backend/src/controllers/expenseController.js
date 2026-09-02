const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  sequelize, Expense, ExpenseItem, ExpenseTax, ExpenseBudget, Project, CashBox, ThirdParty, PurchaseOrderPayment,
} = require('../models');
const { relativePath } = require('../middleware/upload');
const { scanInvoice } = require('../services/invoiceScanService');
const { assertCashBoxUsable, overdraftWarning } = require('../services/cashBoxService');
const aiVisionService = require('../services/aiVisionService');
const { getExtractor } = require('../config/aiDocumentExtractors');
const { nextExpenseNumber, contractPrefixForProject } = require('../services/numberingService');

// Estos controladores atienden DOS montajes de ruta: el anidado en proyecto
// (/projects/:projectId/expenses, ver expenseRoutes.js — comportamiento sin cambios) y el global
// (/expenses, ver globalExpenseRoutes.js), usado por la vista general de Gastos donde el proyecto
// es opcional y hay filtros adicionales. Es la MISMA lógica de negocio en ambos casos: cuando la
// ruta trae :projectId se usa como filtro estricto (igual que antes); cuando no, se opera sin esa
// restricción y se admiten los filtros de la vista general. Así no se duplica el modelo de datos
// ni el componente entre los dos puntos de entrada.

const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
const EXPENSE_INCLUDE = [
  { model: ExpenseItem, as: 'items' },
  { model: ExpenseTax, as: 'taxes' },
  { model: Project, attributes: ['id', 'name'] },
  { model: CashBox, attributes: ['id', 'name'] },
  { model: ThirdParty, as: 'supplierParty', attributes: ['id', 'name'] },
];

function scopeWhere(req) {
  const where = { id: req.params.id };
  if (req.params.projectId) where.projectId = req.params.projectId;
  return where;
}

// items/taxes llegan como JSON string (el formulario es multipart/form-data por el archivo
// adjunto). Se valida y normaliza cada fila; una fila inválida se descarta en vez de abortar.
function parseJsonArray(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError(400, 'items/taxes debe ser un JSON array válido');
  }
}

function sanitizeItems(raw) {
  return parseJsonArray(raw)
    .filter((it) => it && it.description && String(it.description).trim())
    .map((it) => ({
      description: String(it.description).trim(),
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      totalPrice: Number(it.totalPrice) || 0,
    }));
}

function sanitizeTaxes(raw) {
  return parseJsonArray(raw)
    .filter((t) => t && t.name && String(t.name).trim())
    .map((t) => ({
      name: String(t.name).trim(),
      rate: t.rate === '' || t.rate === undefined || t.rate === null ? null : Number(t.rate),
      amount: Number(t.amount) || 0,
    }));
}

// Con upload.fields([...]), multer llena req.files como { invoiceFile: [file], paymentReceiptFile: [file] }
// en vez de req.file. Cada adjunto queda identificado por su propio campo/columna (factura vs.
// comprobante de pago), no como adjuntos genéricos.
function filesFromRequest(req) {
  return {
    invoiceFile: req.files?.invoiceFile?.[0] || null,
    paymentReceiptFile: req.files?.paymentReceiptFile?.[0] || null,
  };
}

// Filtros de la vista general (ruta global, sin :projectId): proyecto (incluyendo "sin
// proyecto"), proveedor, caja y rango de fechas, combinables entre sí. En la ruta anidada el
// proyecto queda fijo por la URL y estos filtros de proyecto no aplican.
const list = asyncHandler(async (req, res) => {
  const { from, to, category, supplierId, cashBoxId } = req.query;
  const where = {};
  if (req.params.projectId) {
    where.projectId = req.params.projectId;
  } else if (req.query.projectId) {
    where.projectId = req.query.projectId === 'none' ? null : req.query.projectId;
  }
  if (category) where.category = category;
  if (supplierId) where.supplierId = supplierId;
  if (cashBoxId) where.cashBoxId = cashBoxId;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  const expenses = await Expense.findAll({ where, include: EXPENSE_INCLUDE, order: [['date', 'DESC']] });

  // Abonos de la Orden de Compra de origen (ver purchaseOrderController.addPayment): nunca se
  // mueven ni se duplican al convertir a gasto, quedan trazables por Expense.sourceId = order.id.
  // Una sola consulta para todos los gastos de la página, no una por fila.
  const orderIds = expenses.filter((e) => e.source === 'purchase_order').map((e) => e.sourceId);
  const paymentsByOrder = new Map();
  if (orderIds.length) {
    const payments = await PurchaseOrderPayment.findAll({ where: { purchaseOrderId: orderIds }, order: [['date', 'DESC']] });
    for (const p of payments) {
      const list = paymentsByOrder.get(p.purchaseOrderId) || [];
      list.push(p);
      paymentsByOrder.set(p.purchaseOrderId, list);
    }
  }

  res.json(expenses.map((e) => ({
    ...e.toJSON(),
    purchaseOrderPayments: e.source === 'purchase_order' ? (paymentsByOrder.get(e.sourceId) || []) : undefined,
  })));
});

const create = asyncHandler(async (req, res) => {
  const {
    category, amount, date, description, vendorName, vendorNit, vendorPhone, vendorEmail,
    subtotal, taxAmount, cashBoxId, supplierId,
  } = req.body;
  // Ruta anidada: projectId siempre viene en la URL. Ruta global: opcional, en el body (el gasto
  // puede quedar sin proyecto).
  const projectId = req.params.projectId || req.body.projectId || null;

  if (!category || !CATEGORIES.includes(category)) throw new ApiError(400, `category debe ser uno de: ${CATEGORIES.join(', ')}`);
  if (amount === undefined || Number(amount) < 0) throw new ApiError(400, 'amount es obligatorio y no puede ser negativo');
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!cashBoxId) throw new ApiError(400, 'cashBoxId es obligatorio');

  if (projectId && !req.user.isAdmin && !req.user.projectIds.includes(projectId)) {
    throw new ApiError(403, 'No tiene acceso a este proyecto');
  }

  const items = sanitizeItems(req.body.items);
  const taxes = sanitizeTaxes(req.body.taxes);
  const { invoiceFile, paymentReceiptFile } = filesFromRequest(req);

  const { expense, warning } = await sequelize.transaction(async (t) => {
    await assertCashBoxUsable(cashBoxId, { transaction: t });
    const expenseNumber = await nextExpenseNumber(t);
    const contractPrefix = await contractPrefixForProject(projectId, t);
    const created = await Expense.create({
      projectId,
      cashBoxId,
      supplierId: supplierId || null,
      category,
      amount,
      date,
      description,
      vendorName: vendorName || null,
      vendorNit: vendorNit || null,
      vendorPhone: vendorPhone || null,
      vendorEmail: vendorEmail || null,
      subtotal: subtotal || null,
      taxAmount: taxAmount || null,
      supportFilePath: relativePath(invoiceFile),
      paymentReceiptFilePath: relativePath(paymentReceiptFile),
      source: 'manual',
      createdBy: req.user.id,
      expenseNumber,
      contractPrefix,
    }, { transaction: t });
    if (items.length) await ExpenseItem.bulkCreate(items.map((it) => ({ ...it, expenseId: created.id })), { transaction: t });
    if (taxes.length) await ExpenseTax.bulkCreate(taxes.map((tx) => ({ ...tx, expenseId: created.id })), { transaction: t });
    const w = await overdraftWarning(cashBoxId, { transaction: t });
    return { expense: created, warning: w };
  });

  const full = await Expense.findByPk(expense.id, { include: EXPENSE_INCLUDE });
  res.status(201).json({ ...full.toJSON(), warning });
});

// Lee una factura (PDF o imagen) subida y devuelve los datos que se lograron reconocer, para
// prellenar el formulario de gasto. No crea el gasto: el usuario revisa/corrige y confirma.
// Usa la API de Claude (visión) cuando hay ANTHROPIC_API_KEY configurada, con mejor precisión
// en montos/ítems que el motor local; si la clave no está configurada cae al motor local (OCR
// con Tesseract + heurísticas de texto) que ya existía, para no perder la funcionalidad.
const scan = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo PDF o imagen (jpg, png, webp)');
  if (aiVisionService.isConfigured()) {
    const extractor = getExtractor('invoice');
    const result = await aiVisionService.extractStructuredData({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      instructions: extractor.instructions,
      schemaDescription: extractor.schemaDescription,
      maxTokens: extractor.maxTokens,
    });
    return res.json(result);
  }
  const result = await scanInvoice(req.file.buffer, req.file.mimetype);
  res.json(result);
});

const update = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ where: scopeWhere(req) });
  if (!expense) throw new ApiError(404, 'Gasto no encontrado');

  const { invoiceFile, paymentReceiptFile } = filesFromRequest(req);

  if (expense.source !== 'manual') {
    // Un gasto generado automáticamente (Pasar a Gastos, liquidación, ...) no se puede editar en
    // sus datos — el monto/ítems quedarían desincronizados de su origen — pero sí se le puede
    // completar o reemplazar la factura y/o el comprobante de pago en cualquier momento después
    // de creado, sin afectar nada más. Solo se permite acá si la petición trae ÚNICAMENTE
    // archivo(s): cualquier otro campo se rechaza con el mismo mensaje de siempre.
    const otherFieldsSent = Object.keys(req.body).some((k) => k !== 'items' && k !== 'taxes')
      || (req.body.items !== undefined && req.body.items !== '' && req.body.items !== '[]')
      || (req.body.taxes !== undefined && req.body.taxes !== '' && req.body.taxes !== '[]');
    if (otherFieldsSent || (!invoiceFile && !paymentReceiptFile)) {
      throw new ApiError(400, 'Este gasto se generó automáticamente: solo se le puede adjuntar o reemplazar la factura y el comprobante de pago.');
    }
    if (invoiceFile) expense.supportFilePath = relativePath(invoiceFile);
    if (paymentReceiptFile) expense.paymentReceiptFilePath = relativePath(paymentReceiptFile);
    await expense.save();
    const full = await Expense.findByPk(expense.id, { include: EXPENSE_INCLUDE });
    return res.json(full);
  }

  const {
    category, amount, date, description, vendorName, vendorNit, vendorPhone, vendorEmail,
    subtotal, taxAmount, cashBoxId, supplierId,
  } = req.body;
  if (category !== undefined) {
    if (!CATEGORIES.includes(category)) throw new ApiError(400, `category debe ser uno de: ${CATEGORIES.join(', ')}`);
    expense.category = category;
  }
  if (amount !== undefined) {
    if (Number(amount) < 0) throw new ApiError(400, 'amount no puede ser negativo');
    expense.amount = amount;
  }
  if (date !== undefined) expense.date = date;
  if (description !== undefined) expense.description = description;
  if (vendorName !== undefined) expense.vendorName = vendorName || null;
  if (vendorNit !== undefined) expense.vendorNit = vendorNit || null;
  if (vendorPhone !== undefined) expense.vendorPhone = vendorPhone || null;
  if (vendorEmail !== undefined) expense.vendorEmail = vendorEmail || null;
  if (subtotal !== undefined) expense.subtotal = subtotal || null;
  if (taxAmount !== undefined) expense.taxAmount = taxAmount || null;
  if (supplierId !== undefined) expense.supplierId = supplierId || null;
  // El proyecto solo es editable desde la ruta general: en la ruta anidada queda fijo por la URL,
  // igual que siempre.
  if (!req.params.projectId && req.body.projectId !== undefined) {
    const newProjectId = req.body.projectId || null;
    if (newProjectId && !req.user.isAdmin && !req.user.projectIds.includes(newProjectId)) {
      throw new ApiError(403, 'No tiene acceso a este proyecto');
    }
    expense.projectId = newProjectId;
  }
  if (invoiceFile) expense.supportFilePath = relativePath(invoiceFile);
  if (paymentReceiptFile) expense.paymentReceiptFilePath = relativePath(paymentReceiptFile);

  const items = req.body.items !== undefined ? sanitizeItems(req.body.items) : null;
  const taxes = req.body.taxes !== undefined ? sanitizeTaxes(req.body.taxes) : null;

  let warning = null;
  await sequelize.transaction(async (t) => {
    if (cashBoxId !== undefined && cashBoxId !== expense.cashBoxId) {
      await assertCashBoxUsable(cashBoxId, { transaction: t });
      expense.cashBoxId = cashBoxId;
    }
    await expense.save({ transaction: t });
    if (items) {
      await ExpenseItem.destroy({ where: { expenseId: expense.id }, transaction: t });
      if (items.length) await ExpenseItem.bulkCreate(items.map((it) => ({ ...it, expenseId: expense.id })), { transaction: t });
    }
    if (taxes) {
      await ExpenseTax.destroy({ where: { expenseId: expense.id }, transaction: t });
      if (taxes.length) await ExpenseTax.bulkCreate(taxes.map((tx) => ({ ...tx, expenseId: expense.id })), { transaction: t });
    }
    warning = await overdraftWarning(expense.cashBoxId, { transaction: t });
  });

  const full = await Expense.findByPk(expense.id, { include: EXPENSE_INCLUDE });
  res.json({ ...full.toJSON(), warning });
});

const remove = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ where: scopeWhere(req) });
  if (!expense) throw new ApiError(404, 'Gasto no encontrado');
  if (expense.source !== 'manual') throw new ApiError(400, 'Este gasto se generó automáticamente y no puede eliminarse manualmente');
  await expense.destroy();
  res.status(204).send();
});

// Presupuesto por categoría (para el consolidado presupuesto vs. gasto vs. saldo). Solo tiene
// sentido por proyecto: no se expone en la ruta general.
const setBudget = asyncHandler(async (req, res) => {
  const { category, budgetedAmount } = req.body;
  if (!CATEGORIES.includes(category)) throw new ApiError(400, `category debe ser uno de: ${CATEGORIES.join(', ')}`);
  if (budgetedAmount === undefined || Number(budgetedAmount) < 0) throw new ApiError(400, 'budgetedAmount no puede ser negativo');

  const [budget] = await ExpenseBudget.findOrCreate({
    where: { projectId: req.params.projectId, category },
    defaults: { budgetedAmount },
  });
  budget.budgetedAmount = budgetedAmount;
  await budget.save();
  res.json(budget);
});

// Vista consolidada: presupuesto vs. gasto acumulado vs. saldo disponible, por categoría. Solo
// por proyecto (no se expone en la ruta general).
const summary = asyncHandler(async (req, res) => {
  // Secuencial, no Promise.all: comparten la transacción/conexión de la petición (RLS).
  const budgets = await ExpenseBudget.findAll({ where: { projectId: req.params.projectId } });
  const expenses = await Expense.findAll({ where: { projectId: req.params.projectId } });

  const summaryRows = CATEGORIES.map((category) => {
    const budgeted = budgets.find((b) => b.category === category);
    const budgetedAmount = budgeted ? Number(budgeted.budgetedAmount) : 0;
    const spent = expenses.filter((e) => e.category === category).reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      category,
      budgetedAmount,
      spent,
      available: budgetedAmount - spent,
    };
  });

  res.json({
    rows: summaryRows,
    totals: {
      budgetedAmount: summaryRows.reduce((s, r) => s + r.budgetedAmount, 0),
      spent: summaryRows.reduce((s, r) => s + r.spent, 0),
      available: summaryRows.reduce((s, r) => s + r.available, 0),
    },
  });
});

module.exports = { list, create, update, remove, setBudget, summary, scan };
