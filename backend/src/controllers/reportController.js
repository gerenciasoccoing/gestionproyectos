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
  const [milestones, minutes] = await Promise.all([
    Milestone.findAll({ where: { projectId: req.params.projectId }, order: [['plannedDate', 'ASC']] }),
    Minute.findAll({ where: { projectId: req.params.projectId }, order: [['date', 'ASC']] }),
  ]);
  res.json({ milestones, minutes });
});

// Informe de avance por ítem de presupuesto, incluyendo galería de fotos.
const progressByItem = asyncHandler(async (req, res) => {
  const { items } = await getBudgetItemsWithProgress(req.params.projectId);
  const withPhotos = await Promise.all(items.map(async (item) => {
    const entries = await ProgressEntry.findAll({
      where: { budgetItemId: item.id },
      include: [{ model: ProgressPhoto, as: 'photos' }],
      order: [['date', 'ASC']],
    });
    const photos = entries.flatMap((e) => e.photos.map((p) => p.filePath));
    return { ...item, photos };
  }));
  res.json(withPhotos);
});

async function gatherReportData(projectId) {
  const [project, evmResult, milestones, minutes, risks, progress] = await Promise.all([
    Project.findByPk(projectId),
    computeEVM(projectId),
    Milestone.findAll({ where: { projectId }, order: [['plannedDate', 'ASC']] }),
    Minute.findAll({ where: { projectId }, order: [['date', 'ASC']] }),
    Risk.findAll({ where: { projectId } }),
    getBudgetItemsWithProgress(projectId),
  ]);

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
