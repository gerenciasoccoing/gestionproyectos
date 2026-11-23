const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const materialContractAnalysisService = require('../services/materialContractAnalysisService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateMaterialContractAnalysisPdf, generateMaterialContractAnalysisExcel } = require('../services/pdfService');

const get = asyncHandler(async (req, res) => {
  const analysis = await materialContractAnalysisService.getContractAnalysis(req.params.projectId);
  if (!analysis) throw new ApiError(404, 'Proyecto no encontrado');
  res.json(analysis);
});

const exportPdf = asyncHandler(async (req, res) => {
  const analysis = await materialContractAnalysisService.getContractAnalysis(req.params.projectId);
  if (!analysis) throw new ApiError(404, 'Proyecto no encontrado');
  const company = await getLetterheadForProject(req.params.projectId);
  const doc = generateMaterialContractAnalysisPdf({ analysis, company });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="analisis-materiales-${analysis.project.name.replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);
});

const exportExcel = asyncHandler(async (req, res) => {
  const analysis = await materialContractAnalysisService.getContractAnalysis(req.params.projectId);
  if (!analysis) throw new ApiError(404, 'Proyecto no encontrado');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="analisis-materiales-${analysis.project.name.replace(/\s+/g, '_')}.xlsx"`);
  const workbook = await generateMaterialContractAnalysisExcel({ analysis });
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = { get, exportPdf, exportExcel };
