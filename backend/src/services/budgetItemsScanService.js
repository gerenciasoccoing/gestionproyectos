const XLSX = require('xlsx');
const path = require('path');
const ApiError = require('../utils/ApiError');
const { extractStructuredData, extractStructuredDataFromText } = require('./aiVisionService');
const { getExtractor } = require('../config/aiDocumentExtractors');

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
// Límite de caracteres del texto que se manda a la IA: un presupuesto real cabe de sobra: acá
// solo se evita mandar un Excel gigantesco (ej. con hojas ajenas al presupuesto) sin control.
const MAX_EXCEL_TEXT_CHARS = 40000;

// Convierte todas las hojas de un workbook a texto plano tipo CSV, una hoja tras otra con su
// nombre como encabezado. Claude no acepta .xlsx como bloque "document" (eso es solo para PDF),
// así que para Excel el camino es: leer las celdas nosotros mismos (misma librería que ya usa la
// importación de presupuesto/catálogo APU) y mandarle el texto resultante a la IA, en vez de
// mandarle el archivo binario.
function workbookToText(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) parts.push(`Hoja: ${sheetName}\n${csv.trim()}`);
  }
  return parts.join('\n\n').slice(0, MAX_EXCEL_TEXT_CHARS);
}

function sanitizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .filter((it) => it && String(it.description || '').trim())
    .map((it) => ({
      description: String(it.description).trim(),
      unit: it.unit ? String(it.unit).trim() : '',
      quantity: it.quantity != null ? Number(it.quantity) : null,
      unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
      totalPrice: it.totalPrice != null ? Number(it.totalPrice) : null,
    }));
}

// Lee un presupuesto (imagen, PDF o Excel) y devuelve { items } con lo que la IA logró
// reconocer, para que el usuario los revise en la vista previa antes de crear los ítems (nunca
// se crea nada acá). Lanza un error claro en vez de devolver un array vacío silencioso cuando el
// archivo no se pudo leer o la IA no identificó ninguna fila reconocible — así el usuario nunca
// termina con ítems vacíos o inventados sin darse cuenta.
async function scanBudgetItemsFile({ buffer, mimetype, originalname }) {
  const extractor = getExtractor('budgetItems');
  const ext = path.extname(originalname || '').toLowerCase();

  let result;
  if (EXCEL_EXTENSIONS.includes(ext)) {
    let text;
    try {
      text = workbookToText(buffer);
    } catch (err) {
      throw new ApiError(422, `No se pudo leer el archivo Excel: ${err.message}`);
    }
    if (!text.trim()) {
      throw new ApiError(422, 'El archivo Excel no tiene contenido legible en ninguna hoja.');
    }
    result = await extractStructuredDataFromText({
      text,
      instructions: extractor.instructions,
      schemaDescription: extractor.schemaDescription,
      maxTokens: extractor.maxTokens,
    });
  } else {
    result = await extractStructuredData({
      buffer,
      mimetype,
      instructions: extractor.instructions,
      schemaDescription: extractor.schemaDescription,
      maxTokens: extractor.maxTokens,
    });
  }

  const items = sanitizeItems(result?.items);
  if (!items.length) {
    throw new ApiError(422, 'No se pudieron identificar ítems de presupuesto reconocibles en el archivo. Verifica que tenga una tabla legible (descripción, unidad, cantidad, valor) o inténtalo con otro archivo.');
  }
  return { items };
}

module.exports = { scanBudgetItemsFile };
