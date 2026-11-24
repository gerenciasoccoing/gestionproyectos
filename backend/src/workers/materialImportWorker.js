// Worker thread aislado para parsear el Excel/CSV de importación masiva de materiales — mismo
// criterio que budgetImportWorker.js: aísla la librería `xlsx` (vulnerable ante archivos no
// confiables) en un proceso hijo con timeout (ver materialImportService.js). SheetJS lee .xlsx,
// .xls y .csv con la misma llamada (detecta el formato solo), así que un único worker cubre los
// tres formatos aceptados por la especificación.
const { parentPort, workerData } = require('worker_threads');
const XLSX = require('xlsx');

try {
  const workbook = XLSX.read(workerData.buffer, {
    type: 'buffer', cellFormula: false, bookVBA: false, bookFiles: false, raw: false,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo no tiene ninguna hoja con datos.');
  const sheet = workbook.Sheets[firstSheetName];
  // header:1 -> array de arrays (fila 0 = encabezados tal como vienen en el archivo), para poder
  // detectar la plantilla oficial O mapear columnas con IA sin asumir nombres fijos de columna.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  if (!rows.length) throw new Error('El archivo no tiene filas.');

  const headerRowIndex = rows.findIndex((r) => r.some((cell) => String(cell || '').trim() !== ''));
  if (headerRowIndex === -1) throw new Error('No se encontró una fila de encabezados con datos.');
  const headers = rows[headerRowIndex].map((h) => String(h || '').trim());
  const dataRows = rows.slice(headerRowIndex + 1)
    .filter((r) => r.some((cell) => String(cell || '').trim() !== ''))
    .map((r) => headers.map((_, i) => String(r[i] ?? '').trim()));

  parentPort.postMessage({ ok: true, headers, rows: dataRows });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
