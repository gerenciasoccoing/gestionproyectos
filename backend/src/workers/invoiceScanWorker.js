// Worker thread aislado para leer facturas (PDF o imagen) subidas por el usuario: aísla el
// procesamiento de un archivo no confiable (pdf-parse/pdfjs-dist ha tenido CVEs de parsers de
// PDF en el pasado, y el OCR es intensivo en CPU) del proceso principal, con timeout — mismo
// patrón que priceImportWorker.js / budgetImportWorker.js.
const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { createWorker } = require('tesseract.js');

const MIN_TEXT_LENGTH = 30; // por debajo de esto, se asume PDF escaneado y se recurre a OCR.
const SPA_LANG_PATH = path.join(__dirname, '../../node_modules/@tesseract.js-data/spa/4.0.0_best_int');
const TESS_CACHE_PATH = path.join(require('os').tmpdir(), 'tesseract-cache');

async function ocrImage(buffer) {
  // langPath local (paquete @tesseract.js-data/spa) para no depender de la CDN de tesseract.js
  // en tiempo de ejecución; en Node, tesseract.js-core también se resuelve localmente.
  const worker = await createWorker('spa', 1, { langPath: SPA_LANG_PATH, cachePath: TESS_CACHE_PATH, gzip: true });
  try {
    const { data } = await worker.recognize(buffer);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = (result.text || '').trim();
      if (text.length >= MIN_TEXT_LENGTH) return text;
      // Sin capa de texto (factura escaneada): rasteriza la primera página y aplica OCR.
      const shot = await parser.getScreenshot({ scale: 2, first: 1, last: 1 });
      if (!shot.pages?.[0]) return text;
      return ocrImage(shot.pages[0].data);
    } finally {
      await parser.destroy();
    }
  }
  if (mimetype.startsWith('image/')) {
    return ocrImage(buffer);
  }
  throw new Error(`Tipo de archivo no soportado para lectura automática: ${mimetype}`);
}

extractText(workerData.buffer, workerData.mimetype)
  .then((text) => parentPort.postMessage({ ok: true, text }))
  .catch((err) => parentPort.postMessage({ ok: false, error: err.message }));
