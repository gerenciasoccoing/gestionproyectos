// Worker thread aislado para parsear archivos Excel subidos por el usuario.
// La librería `xlsx` (SheetJS, edición comunitaria publicada en npm) tiene vulnerabilidades
// conocidas sin parche disponible (ReDoS y contaminación de prototipo) al procesar archivos
// no confiables. Aislar el parseo en un worker con timeout (ver excelParseService.js) evita
// que un archivo malicioso o corrupto cuelgue el proceso principal o contamine su estado.
const { parentPort, workerData } = require('worker_threads');
const XLSX = require('xlsx');

try {
  const workbook = XLSX.read(workerData.buffer, {
    type: 'buffer',
    cellFormula: false,
    bookVBA: false,
    bookFiles: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo no tiene hojas.');
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  parentPort.postMessage({ ok: true, rows });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
