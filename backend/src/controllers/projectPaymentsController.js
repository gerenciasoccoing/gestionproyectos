const asyncHandler = require('../utils/asyncHandler');
const { Project } = require('../models');
const { getProjectPaymentsSummary, getProjectMovements } = require('../services/projectPaymentsService');
const { getProjectBudgetTotal } = require('../services/budgetService');
const { hasAnyRole } = require('../middleware/authorize');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateProjectPaymentsPdf } = require('../services/pdfService');
const { generateProjectPaymentsExcelBuffer } = require('../services/apuExcelExportService');

// Mismo criterio que projectController.js#list para la columna "Valor total del contrato": el
// valor del contrato es referencia visible solo para admin/gerente_proyecto — el resto del resumen
// (ejecutado, bruto, retenciones, saldo real) es visible para cualquiera con acceso al proyecto.
const CONTRACT_VALUE_ROLES = ['gerente_proyecto'];

const getSummary = asyncHandler(async (req, res) => {
  const summary = await getProjectPaymentsSummary(req.params.projectId);
  const contractValue = hasAnyRole(req.user, CONTRACT_VALUE_ROLES) ? await getProjectBudgetTotal(req.params.projectId) : undefined;
  res.json({ ...summary, ...(contractValue !== undefined ? { contractValue } : {}) });
});

const listPayments = asyncHandler(async (req, res) => {
  const { from, to, withholdingTypeId } = req.query;
  const movements = await getProjectMovements(req.params.projectId, { from, to, withholdingTypeId });
  res.json(movements);
});

const exportPdf = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.projectId);
  const [summary, movements, company] = await Promise.all([
    getProjectPaymentsSummary(req.params.projectId),
    getProjectMovements(req.params.projectId, req.query),
    getLetterheadForProject(req.params.projectId),
  ]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="pagos-proyecto-${(project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`);
  const doc = generateProjectPaymentsPdf({ project, summary, movements, company });
  doc.pipe(res);
});

const exportExcel = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.projectId);
  const [summary, movements] = await Promise.all([
    getProjectPaymentsSummary(req.params.projectId),
    getProjectMovements(req.params.projectId, req.query),
  ]);
  const buffer = await generateProjectPaymentsExcelBuffer({ project, summary, movements });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pagos-proyecto-${(project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx"`);
  res.send(buffer);
});

module.exports = { getSummary, listPayments, exportPdf, exportExcel };
