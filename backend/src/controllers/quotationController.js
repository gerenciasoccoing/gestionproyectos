const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Quotation, Budget, BudgetItem } = require('../models');
const { computeApuUnitCost, resolveBudgetItemFields, updateBudgetItemQuantity } = require('../services/budgetService');
const { getQuotationWithBudget, convertQuotationToProject } = require('../services/quotationService');
const { buildApuDataByIdMap } = require('../services/apuExportService');
const { generateQuotationPdf, generateBudgetWithApuAnnexPdf } = require('../services/pdfService');
const { generateBudgetWithApuAnnexExcelBuffer } = require('../services/apuExcelExportService');
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
  if (projectNameProposed !== undefined) {
    if (!projectNameProposed.trim()) throw new ApiError(400, 'clientName, projectNameProposed y date son obligatorios');
    quotation.projectNameProposed = projectNameProposed;
  }
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

  // Misma lógica que el presupuesto de Proyectos (ver budgetController.addItem): la Descripción
  // se toma del APU elegido, no se pide a mano; solo es obligatoria como texto libre para ítems
  // manuales sin APU.
  const { apuId, description, notes, unit, quantity, unitCost } = req.body;
  const fields = await resolveBudgetItemFields({ budget, apuId, description, notes, unit, quantity, unitCost });
  const item = await BudgetItem.create(fields);
  res.status(201).json(item);
});

// Edita la cantidad de un ítem ya agregado al presupuesto de la cotización (misma lógica que
// budgetController.updateItem en Proyectos: el valor unitario queda fijo, solo se recalcula el total).
const updateItem = asyncHandler(async (req, res) => {
  const quotation = await Quotation.findByPk(req.params.id);
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
  if (quotation.status === 'convertida') throw new ApiError(400, 'La cotización ya fue convertida y no puede editarse');
  const item = await BudgetItem.findOne({
    where: { id: req.params.itemId },
    include: [{ association: 'Budget' }],
  });
  if (!item || item.Budget.quotationId !== req.params.id) throw new ApiError(404, 'Ítem no encontrado');
  await updateBudgetItemQuantity(item, req.body.quantity);
  res.json(item);
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

// Presupuesto de la cotización + anexo con la ficha completa de cada APU referenciado, en el
// mismo formato ("modelo_apu.xlsx") y con el mismo generador que la exportación de Presupuesto
// de Proyectos (ver budgetController.buildBudgetExportContext): ambos flujos comparten
// buildApuDataByIdMap y drawApuAnalysis/writeApuSheet para no duplicar ni desincronizar el
// formato. Distinto del PDF de propuesta ejecutiva (exportPdf arriba), que es un documento
// resumido pensado para el cliente, no para justificar el costo con el desglose técnico.
async function buildQuotationExportContext(quotationId, body) {
  const { quotation, budget } = await getQuotationWithBudget(quotationId);
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
  if (!budget) throw new ApiError(404, 'Esta cotización no tiene un presupuesto');
  const items = (budget.items || []).map((it) => it.toJSON());
  const apuDataById = await buildApuDataByIdMap(items, budget);
  const project = { name: quotation.projectNameProposed };

  const { elaboroNombre, revisoNombre } = body;
  return { project, budget, items, apuDataById, elaboroNombre, revisoNombre };
}

const exportBudgetPdf = asyncHandler(async (req, res) => {
  const ctx = await buildQuotationExportContext(req.params.id, req.body);
  const company = await getSettingsForPdf();
  const doc = generateBudgetWithApuAnnexPdf({ ...ctx, company });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${ctx.project.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`);
  doc.pipe(res);
});

const exportBudgetExcel = asyncHandler(async (req, res) => {
  const ctx = await buildQuotationExportContext(req.params.id, req.body);
  const company = await getSettingsForPdf();
  const buffer = await generateBudgetWithApuAnnexExcelBuffer({ ...ctx, company, exportDate: req.body.exportDate });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="presupuesto-${ctx.project.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx"`);
  res.send(buffer);
});

// Conversión en un solo paso: crea el proyecto y le asigna el mismo presupuesto como línea base (atómico).
const convert = asyncHandler(async (req, res) => {
  const project = await convertQuotationToProject(req.params.id, req.user.id);
  res.status(201).json(project);
});

module.exports = {
  list, get, create, update, remove, addItem, updateItem, removeItem, updateAiu, exportPdf, exportBudgetPdf, exportBudgetExcel, convert,
};
