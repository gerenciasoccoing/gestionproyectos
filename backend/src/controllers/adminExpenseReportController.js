const asyncHandler = require('../utils/asyncHandler');
const { getAdminExpenseReport } = require('../services/adminExpenseReportService');
const { getLetterheadForProject } = require('../services/letterheadService');
const { generateAdminExpenseReportPdf } = require('../services/pdfService');
const { generateAdminExpenseReportExcelBuffer } = require('../services/apuExcelExportService');

// Mismos filtros en los tres endpoints (JSON, PDF, Excel) — ver adminExpenseReportService.js. El
// frontend arma mes/trimestre/año/comparación de periodos llamando este mismo endpoint con
// distintos from/to, sin que el backend necesite saber nada de esos conceptos.
function filtersFromQuery(req) {
  const { from, to, adminCategoryId, supplierId, cashBoxId, employeeId } = req.query;
  return { from, to, adminCategoryId, supplierId, cashBoxId, employeeId };
}

const getReport = asyncHandler(async (req, res) => {
  const report = await getAdminExpenseReport(filtersFromQuery(req));
  res.json(report);
});

// getLetterheadForProject(null) devuelve los datos de la empresa principal (nunca un consorcio,
// nunca los de un proyecto) — exactamente lo que pide la especificación para todo lo administrativo.
const exportPdf = asyncHandler(async (req, res) => {
  const filters = filtersFromQuery(req);
  const [report, company] = await Promise.all([
    getAdminExpenseReport(filters),
    getLetterheadForProject(null),
  ]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-gastos-administrativos.pdf"');
  const doc = generateAdminExpenseReportPdf({ report, filters, company });
  doc.pipe(res);
});

const exportExcel = asyncHandler(async (req, res) => {
  const filters = filtersFromQuery(req);
  const [report, company] = await Promise.all([
    getAdminExpenseReport(filters),
    getLetterheadForProject(null),
  ]);
  const buffer = await generateAdminExpenseReportExcelBuffer({ report, filters, company });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-gastos-administrativos.xlsx"');
  res.send(buffer);
});

module.exports = { getReport, exportPdf, exportExcel };
