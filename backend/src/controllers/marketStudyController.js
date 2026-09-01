const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  MarketStudy, MarketStudyQuotation, MarketStudyQuotationItem, ThirdParty, Project, BudgetItem, PurchaseOrder,
} = require('../models');
const { relativePath } = require('../middleware/upload');
const { scanSupplierQuotationFile } = require('../services/marketStudyScanService');
const { buildComparison, generateDraftOrders } = require('../services/marketStudyService');

// Estos controladores atienden DOS montajes de ruta, igual que Órdenes de Compra: el anidado en
// proyecto (/projects/:projectId/market-studies) y el global (/market-studies), usado desde el
// menú principal con proyecto opcional. Misma lógica de negocio en ambos casos.
// Normaliza los ítems que llegan del formulario (creación manual o revisión de lo leído por IA):
// calcula totalPrice a partir de cantidad×precio unitario cuando no viene explícito (el
// formulario del frontend no pide ese campo aparte, solo cantidad y precio unitario) — mismo
// criterio que sanitizeItems en marketStudyScanService.js, pero sin pisar el groupKey/needsReview
// que el usuario ya haya revisado/editado a mano.
function sanitizeQuotationItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((it) => {
      const quantity = it.quantity !== undefined && it.quantity !== '' ? Number(it.quantity) : null;
      const unitPrice = it.unitPrice !== undefined && it.unitPrice !== '' ? Number(it.unitPrice) : null;
      const totalPrice = it.totalPrice !== undefined && it.totalPrice !== ''
        ? Number(it.totalPrice)
        : (quantity != null && unitPrice != null ? quantity * unitPrice : null);
      return {
        name: String(it.name || '').trim(),
        unit: it.unit || null,
        quantity,
        unitPrice,
        totalPrice,
        groupKey: (it.groupKey || it.name || '').toString().trim().toLowerCase(),
        needsReview: Boolean(it.needsReview),
      };
    })
    .filter((it) => it.name);
}

function scopeWhere(req) {
  const where = { id: req.params.id };
  if (req.params.projectId) where.projectId = req.params.projectId;
  return where;
}

const QUOTATION_INCLUDE = [
  { model: ThirdParty, as: 'supplierParty', attributes: ['id', 'name'] },
  { model: MarketStudyQuotationItem, as: 'items' },
];

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.params.projectId) where.projectId = req.params.projectId;
  else if (req.query.projectId) where.projectId = req.query.projectId;
  const studies = await MarketStudy.findAll({
    where,
    include: [
      { model: Project, attributes: ['id', 'name'] },
      { model: MarketStudyQuotation, as: 'quotations', attributes: ['id'] },
    ],
    order: [['createdAt', 'DESC']],
  });
  res.json(studies.map((s) => ({ ...s.toJSON(), quotationCount: s.quotations.length, quotations: undefined })));
});

const get = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({
    where: scopeWhere(req),
    include: [
      { model: Project, attributes: ['id', 'name'] },
      { model: BudgetItem, attributes: ['id', 'description'] },
      { model: MarketStudyQuotation, as: 'quotations', include: QUOTATION_INCLUDE },
      { model: PurchaseOrder, as: 'draftOrders', attributes: ['id', 'orderNumber', 'contractPrefix', 'supplier', 'approvalState'] },
    ],
  });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');
  res.json(study);
});

const create = asyncHandler(async (req, res) => {
  const { title, budgetItemId } = req.body;
  const projectId = req.params.projectId || req.body.projectId || null;
  if (!title || !title.trim()) throw new ApiError(400, 'title es obligatorio');

  if (projectId && !req.user.isAdmin && !req.user.projectIds.includes(projectId)) {
    throw new ApiError(403, 'No tiene acceso a este proyecto');
  }
  if (budgetItemId) {
    if (!projectId) throw new ApiError(400, 'No se puede vincular un ítem de presupuesto sin asignar un proyecto');
    const linked = await BudgetItem.findByPk(budgetItemId, { include: [{ association: 'Budget' }] });
    if (!linked || linked.Budget.projectId !== projectId) {
      throw new ApiError(400, `El ítem de presupuesto ${budgetItemId} no pertenece a este proyecto`);
    }
  }

  const study = await MarketStudy.create({
    projectId,
    budgetItemId: budgetItemId || null,
    title: title.trim(),
    createdBy: req.user.id,
  });
  res.status(201).json(study);
});

const update = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({ where: scopeWhere(req) });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');

  const { title, budgetItemId } = req.body;
  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'title no puede estar vacío');
    study.title = title.trim();
  }
  if (budgetItemId !== undefined) study.budgetItemId = budgetItemId || null;
  await study.save();
  res.json(study);
});

const remove = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({ where: scopeWhere(req) });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');
  await study.destroy();
  res.status(204).send();
});

// Lee una cotización (PDF/imagen/Excel) con IA y devuelve lo que logró reconocer, sin guardar
// nada — el usuario revisa/corrige en el formulario y confirma con addQuotation.
const scanQuotation = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo PDF, imagen o Excel');
  const result = await scanSupplierQuotationFile({
    buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname,
  });
  res.json(result);
});

const addQuotation = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({ where: scopeWhere(req) });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');
  if (study.status === 'decidida') throw new ApiError(400, 'Este estudio ya fue decidido: no se pueden agregar más cotizaciones.');

  const {
    supplierId, supplierNameRaw, deliveryTime, validUntil, paymentTerms, extractionStatus,
  } = req.body;
  if (!supplierNameRaw || !supplierNameRaw.trim()) throw new ApiError(400, 'supplierNameRaw es obligatorio');

  let items;
  try {
    items = JSON.parse(req.body.items || '[]');
  } catch {
    throw new ApiError(400, 'items debe ser un JSON array válido');
  }
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'Debe incluir al menos un ítem');

  const quotation = await MarketStudyQuotation.create({
    marketStudyId: study.id,
    supplierId: supplierId || null,
    supplierNameRaw: supplierNameRaw.trim(),
    filePath: relativePath(req.file),
    deliveryTime: deliveryTime || null,
    validUntil: validUntil || null,
    paymentTerms: paymentTerms || null,
    extractionStatus: extractionStatus === 'revisar' ? 'revisar' : 'ok',
    createdBy: req.user.id,
  });

  await MarketStudyQuotationItem.bulkCreate(sanitizeQuotationItems(items).map((it) => ({
    ...it, marketStudyQuotationId: quotation.id,
  })));

  const full = await MarketStudyQuotation.findByPk(quotation.id, { include: QUOTATION_INCLUDE });
  res.status(201).json(full);
});

// Edición manual de una cotización ya cargada (revisión de lo extraído por IA): reemplaza la
// cabecera y, si vienen items, la lista completa de ítems (son solo lecturas extraídas, no
// registros con historial propio como los de una Orden de Compra ya creada — reemplazar es más
// simple y suficiente acá).
const updateQuotation = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({ where: scopeWhere(req) });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');
  if (study.status === 'decidida') throw new ApiError(400, 'Este estudio ya fue decidido y no se puede editar.');

  const quotation = await MarketStudyQuotation.findOne({ where: { id: req.params.quotationId, marketStudyId: study.id } });
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');

  const { supplierId, supplierNameRaw, deliveryTime, validUntil, paymentTerms, items } = req.body;
  if (supplierId !== undefined) quotation.supplierId = supplierId || null;
  if (supplierNameRaw !== undefined) quotation.supplierNameRaw = supplierNameRaw.trim();
  if (deliveryTime !== undefined) quotation.deliveryTime = deliveryTime || null;
  if (validUntil !== undefined) quotation.validUntil = validUntil || null;
  if (paymentTerms !== undefined) quotation.paymentTerms = paymentTerms || null;

  if (Array.isArray(items)) {
    await MarketStudyQuotationItem.destroy({ where: { marketStudyQuotationId: quotation.id } });
    await MarketStudyQuotationItem.bulkCreate(sanitizeQuotationItems(items).map((it) => ({
      ...it, marketStudyQuotationId: quotation.id,
    })));
    quotation.extractionStatus = 'ok';
  }
  await quotation.save();

  const full = await MarketStudyQuotation.findByPk(quotation.id, { include: QUOTATION_INCLUDE });
  res.json(full);
});

const removeQuotation = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({ where: scopeWhere(req) });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');
  if (study.status === 'decidida') throw new ApiError(400, 'Este estudio ya fue decidido y no se puede editar.');

  const quotation = await MarketStudyQuotation.findOne({ where: { id: req.params.quotationId, marketStudyId: study.id } });
  if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
  await quotation.destroy();
  res.status(204).send();
});

const comparison = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({
    where: scopeWhere(req),
    include: [{ model: MarketStudyQuotation, as: 'quotations', include: QUOTATION_INCLUDE }],
  });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');
  res.json(buildComparison(study));
});

// drafts: [{ supplierId, supplierName, cashBoxId, date, retentionPercent, itemIds }]. Nunca
// genera nada automáticamente: siempre es la elección explícita que el usuario mandó en el body.
const generateDraft = asyncHandler(async (req, res) => {
  const study = await MarketStudy.findOne({ where: scopeWhere(req) });
  if (!study) throw new ApiError(404, 'Estudio de mercado no encontrado');
  if (study.status === 'decidida') throw new ApiError(400, 'Este estudio ya fue decidido.');

  const { drafts, decisionNotes } = req.body;
  const orders = await generateDraftOrders(study, drafts, { userId: req.user.id, decisionNotes });
  res.status(201).json({ orders });
});

module.exports = {
  list, get, create, update, remove, scanQuotation, addQuotation, updateQuotation, removeQuotation, comparison, generateDraft,
};
