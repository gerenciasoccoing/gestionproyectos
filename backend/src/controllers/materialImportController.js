const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const materialImportService = require('../services/materialImportService');

const downloadTemplate = asyncHandler(async (req, res) => {
  const workbook = materialImportService.buildTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-materiales.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

// Analiza el archivo y devuelve la vista previa — NUNCA guarda nada (ver materialImportService.js).
const parse = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo .xlsx, .xls o .csv');
  const mappingOverride = req.body.mapping ? JSON.parse(req.body.mapping) : null;
  const result = await materialImportService.parseAndPreview(req.file.buffer, mappingOverride);
  res.json(result);
});

// Guarda de verdad las filas que el usuario confirmó (ver materialImportService.js#commitImport) —
// solo quien tiene permiso para crear materiales puede importar (ver la especificación).
const commit = asyncHandler(async (req, res) => {
  const { rows } = req.body;
  const result = await materialImportService.commitImport(rows);
  res.json(result);
});

// Excel descargable con las filas que tuvieron error (o quedaron duplicadas dentro del archivo),
// para corregirlas y volver a subirlas (ver la especificación) — se reciben del frontend porque la
// vista previa nunca se guardó en el servidor.
const exportErrors = asyncHandler(async (req, res) => {
  const { errorRows } = req.body;
  if (!Array.isArray(errorRows) || !errorRows.length) throw new ApiError(400, 'No hay filas con error para exportar.');
  const workbook = materialImportService.buildErrorWorkbook(errorRows);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="materiales-con-error.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = { downloadTemplate, parse, commit, exportErrors };
