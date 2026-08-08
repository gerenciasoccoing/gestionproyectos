const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Quotation, Budget, BudgetItem } = require('../models');
const { computeApuUnitCost, applyBudgetAiu } = require('../services/budgetService');
const { getQuotationWithBudget, convertQuotationToProject } = require('../services/quotationService');
const { generateQuotationPdf } = require('../services/pdfService');
const { getSettingsForPdf } = require('./companySettingsController');

// Extrae y valida el AIU discriminado (Administración/Imprevistos/Utilidad) del body.
function parseAiuPercents(body) {
  const { adminPercent = 0, imprevistosPercent = 0, utilidadPercent = 0 } = body;
  for (const [label, value] of [['adminPercent', adminPercent], ['imprevistosPercent', imprevistosPercent], ['utilidadPercent', utilidadPercent]]) {
    if (Number(value) < 0) throw new ApiError(400, `${label} no puede ser negativo`);
  }
  return { adminPercent, imprevistosPercent, utilidadPercent };
}

const list = asyncHandler(async (req, res) => {
  const quotations = await Quotation.findAll({ order: [['date', 'DESC']] });
  res.json(quotations);
});

const get = asyncHandler(async (req, res) => {
  const data = await getQuotationWithBudget(req.params.id);
  if (!data.quotation) throw new ApiError(404, 'Cotización no encontrada');
  res.json(data);
});

// El AIU discriminado (Administración, Imprevistos, Utilidad) se define aquí, al crear el
// presupuesto (versión 1) implícito de la cotización.
const create = asyncHandler(async (req, res) => {
  const { clientName, clientId, projectNameProposed, date, validityDays, paymentTerms } = req.body;
  if (!clientName || !projectNameProposed || !date) {
    throw new ApiError(400, 'clientName, projectNameProposed y date son obligatorios');
  }
  const aiu = parseAiuPercents(req.body);
  const quotation = await Quotation.create({
    clientName, clientId: clientId || null, projectNameProposed, date, validityDays: validityDays || 30, paymentTerms,
    createdBy: req.user.id,
  });
  await Budget.create({ quotationId: quotation.id, version: 1, type: 'inicial', ...aiu });
  res.status(201).json(quotation);
});

// Actualiza el AIU discriminado del presupuesto vigente de la cotización.
const updateAiu = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id);
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
  if (quotation.status === 'convertida') throw new ApiError(400, 'La cotización ya fue convertida y no puede editarse');
  const budget = await Budget.findOne({ where: { quotationId: quotation.id }, order: [['version', 'DESC']] });
  if (!budget) throw new ApiError(404, 'Presupuesto no encontrado');
  const aiu = parseAiuPercents(req.body);
  await budget.update(aiu);
  res.json(budget);
});

const update = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id);
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
  if (quotation.status === 'convertida') throw new ApiError(400, 'La cotización ya fue convertida y no puede editarse');

  const { clientName, clientId, projectNameProposed, date, validityDays, paymentTerms, status } = req.body;
  if (clientName !== undefined) quotation.clientName = clientName;
  if (clientId !== undefined) quotation.clientId = clientId || null;
  if (projectNameProposed !== undefined) quotation.projectNameProposed = projectNameProposed;
  if (date !== undefined) quotation.date = date;
  if (validityDays !== undefined) quotation.validityDays = validityDays;
  if (paymentTerms !== undefined) quotation.paymentTerms = paymentTerms;
  if (status !== undefined && ['borrador', 'enviada'].includes(status)) quotation.status = status;
  await quotation.save();
  res.json(quotation);
});

const remove = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id);
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
  if (quotation.status === 'convertida') throw new ApiError(400, 'No se puede eliminar una cotización ya convertida a proyecto');
  const budgets = await Budget.findAll({ where: { quotationId: quotation.id } });
  for (const budget of budgets) {
    await BudgetItem.destroy({ where: { budgetId: budget.id } });
  }
  await Budget.destroy({ where: { quotationId: quotation.id } });
  await quotation.destroy();
  res.status(204).send();
});

const addItem = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id);
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
  if (quotation.status === 'convertida') throw new ApiError(400, 'La cotización ya fue convertida y no puede editarse');

  let budget = await Budget.findOne({ where: { quotationId: quotation.id }, order: [['version', 'DESC']] });
  if (!budget) budget = await Budget.create({ quotationId: quotation.id, version: 1, type: 'inicial' });

  const { apuId, description, unit, quantity } = req.body;
  if (!description || !unit || quantity === undefined) throw new ApiError(400, 'description, unit y quantity son obligatorios');
  if (Number(quantity) < 0) throw new ApiError(400, 'La cantidad no puede ser negativa');

  let unitCost = req.body.unitCost || 0;
  if (apuId) {
    const result = await computeApuUnitCost(apuId);
    if (!result) throw new ApiError(404, 'APU no encontrado');
    unitCost = applyBudgetAiu(result.directCost, budget);
  }

  const item = await BudgetItem.create({
    budgetId: budget.id,
    apuId: apuId || null,
    description,
    unit,
    quantity,
    unitCost,
    totalCost: Number(quantity) * Number(unitCost),
  });
  res.status(201).json(item);
});

const removeItem = asyncHandler(async (req, res) => {
  const item = await BudgetItem.findOne({
    where: { id: req.params.itemId },
    include: [{ association: 'Budget' }],
  });
  if (!item || item.Budget.quotationId !== req.params.id) throw new ApiError(404, 'Ítem no encontrado');
  await item.destroy();
  res.status(204).send();
});

// Genera el PDF de propuesta ejecutiva con desglose de subtotal / AIU / total.
const exportPdf = asyncHandler(async (req, res) => {
  const { quotation, budget } = await getQuotationWithBudget(req.params.id);
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');

  const items = await Promise.all((budget?.items || []).map(async (item) => {
    let directSubtotal = Number(item.totalCost);
    let aiuAmount = 0;
    if (item.apuId) {
      const result = await computeApuUnitCost(item.apuId);
      if (result) {
        directSubtotal = result.directCost * Number(item.quantity);
        aiuAmount = Number(item.totalCost) - directSubtotal;
      }
    }
    return { ...item.toJSON(), directSubtotal, aiuAmount };
  }));

  const company = await getSettingsForPdf();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${quotation.clientName.replace(/\s+/g, '_')}.pdf"`);
  const aiu = budget
    ? { adminPercent: Number(budget.adminPercent), imprevistosPercent: Number(budget.imprevistosPercent), utilidadPercent: Number(budget.utilidadPercent) }
    : { adminPercent: 0, imprevistosPercent: 0, utilidadPercent: 0 };
  const doc = generateQuotationPdf({ quotation, items, company, aiu });
  doc.pipe(res);
});

// Conversión en un solo paso: crea el proyecto y le asigna el mismo presupuesto como línea base (atómico).
const convert = asyncHandler(async (req, res) => {
  const project = await convertQuotationToProject(req.params.id, req.user.id);
  res.status(201).json(project);
});

module.exports = { list, get, create, update, remove, addItem, removeItem, updateAiu, exportPdf, convert };
