const { Worker } = require('worker_threads');
const path = require('path');

// Parsea un buffer de Excel en un worker thread separado con timeout, para contener el
// impacto de las vulnerabilidades conocidas de la librería `xlsx` ante archivos maliciosos
// o corruptos (el worker se termina si excede el tiempo límite, sin afectar al proceso principal).
function parseExcelSafely(buffer, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '../workers/priceImportWorker.js'), {
      workerData: { buffer },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('El archivo tardó demasiado en procesarse (puede estar corrupto o no ser un Excel válido).'));
    }, timeoutMs);

    worker.once('message', (msg) => {
      clearTimeout(timer);
      worker.terminate();
      if (msg.ok) resolve(msg.rows);
      else reject(new Error(`No se pudo leer el archivo Excel: ${msg.error}`));
    });

    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Error procesando el archivo: ${err.message}`));
    });
  });
}

module.exports = { parseExcelSafely };
