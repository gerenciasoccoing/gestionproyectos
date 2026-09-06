const asyncHandler = require('../utils/asyncHandler');
const { Project } = require('../models');
const { generateSchedule, getSchedule } = require('../services/scheduleService');
const { generateSchedulePdf } = require('../services/pdfService');
const { generateScheduleExcelBuffer } = require('../services/apuExcelExportService');
const { getLetterheadForProject } = require('../services/letterheadService');

const get = asyncHandler(async (req, res) => {
  const result = await getSchedule(req.params.projectId);
  res.json(result);
});

// Regenera por completo el cronograma del proyecto (ver scheduleService.generateSchedule):
// reemplaza cualquier cronograma anterior por uno nuevo, calculado a partir del presupuesto
// vigente y el rango de fechas del contrato.
const generate = asyncHandler(async (req, res) => {
  const result = await generateSchedule(req.params.projectId);
  res.status(201).json(result);
});

const exportPdf = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.projectId);
  const schedule = await getSchedule(req.params.projectId);
  const company = await getLetterheadForProject(req.params.projectId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="cronograma-${(project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`);
  const doc = generateSchedulePdf({ project, schedule, company });
  doc.pipe(res);
});

const exportExcel = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.projectId);
  const schedule = await getSchedule(req.params.projectId);
  const buffer = await generateScheduleExcelBuffer({ project, schedule });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cronograma-${(project?.name || 'proyecto').replace(/[^a-zA-Z0-9-_]/g, '_')}.xlsx"`);
  res.send(buffer);
});

module.exports = { get, generate, exportPdf, exportExcel };
