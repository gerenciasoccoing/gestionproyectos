const asyncHandler = require('../utils/asyncHandler');
const { Project, Milestone, Minute, Risk, ProgressPhoto, ProgressEntry } = require('../models');
const { computeEVM, computeSCurve } = require('../services/evmService');
const { getBudgetItemsWithProgress } = require('../services/budgetService');
const { getPurchaseReport } = require('../services/purchaseOrderService');
const { generateProjectReportPdf } = require('../services/pdfService');

const evm = asyncHandler(async (req, res) => {
  const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
  const result = await computeEVM(req.params.projectId, asOfDate);
  res.json(result);
});

const sCurve = asyncHandler(async (req, res) => {
  const result = await computeSCurve(req.params.projectId);
  res.json(result);
});

const milestonesAndMinutesSummary = asyncHandler(async (req, res) => {
  // Secuencial, no Promise.all: comparten la transacción/conexión de la petición (RLS).
  const milestones = await Milestone.findAll({ where: { projectId: req.params.projectId }, order: [['plannedDate', 'ASC']] });
  const minutes = await Minute.findAll({ where: { projectId: req.params.projectId }, order: [['date', 'ASC']] });
  res.json({ milestones, minutes });
});

// Informe de avance por ítem de presupuesto, incluyendo galería de fotos. Una sola consulta para
// las fotos de TODOS los ítems (agrupadas en JS después), no una por ítem — un proyecto con
// muchos ítems de presupuesto no debe traducirse en igual de muchas consultas secuenciales.
const progressByItem = asyncHandler(async (req, res) => {
  const { items } = await getBudgetItemsWithProgress(req.params.projectId);
  const allEntries = await ProgressEntry.findAll({
    where: { budgetItemId: items.map((i) => i.id) },
    include: [{ model: ProgressPhoto, as: 'photos' }],
    order: [['date', 'ASC']],
  });
  const photosByItem = new Map();
  for (const entry of allEntries) {
    const list = photosByItem.get(entry.budgetItemId) || [];
    list.push(...entry.photos.map((p) => p.filePath));
    photosByItem.set(entry.budgetItemId, list);
  }
  const withPhotos = items.map((item) => ({ ...item, photos: photosByItem.get(item.id) || [] }));
  res.json(withPhotos);
});

async function gatherReportData(projectId) {
  // Secuencial, no Promise.all: comparten la transacción/conexión de la petición (RLS).
  const project = await Project.findByPk(projectId);
  const evmResult = await computeEVM(projectId);
  const milestones = await Milestone.findAll({ where: { projectId }, order: [['plannedDate', 'ASC']] });
  const minutes = await Minute.findAll({ where: { projectId }, order: [['date', 'ASC']] });
  const risks = await Risk.findAll({ where: { projectId } });
  const progress = await getBudgetItemsWithProgress(projectId);

  const purchases = await getPurchaseReport(projectId, {});

  return { project, evm: evmResult, milestones, minutes, risks, progressItems: progress.items, purchases };
}

const exportPdf = asyncHandler(async (req, res) => {
  const data = await gatherReportData(req.params.projectId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="informe-${data.project.name.replace(/\s+/g, '_')}.pdf"`);
  const doc = generateProjectReportPdf(data);
  doc.pipe(res);
});

module.exports = { evm, sCurve, milestonesAndMinutesSummary, progressByItem, exportPdf };
