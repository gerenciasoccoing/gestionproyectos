const XLSX = require('xlsx');
const path = require('path');
const { extractStructuredData, extractStructuredDataFromText } = require('./aiVisionService');
const { getExtractor } = require('../config/aiDocumentExtractors');

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const MAX_EXCEL_TEXT_CHARS = 40000;

// Mismo camino que budgetItemsScanService.js#workbookToText: Claude no acepta .xlsx como bloque
// "document" (eso es solo para PDF), así que para Excel se lee la hoja acá mismo y se manda el
// texto resultante a la IA.
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

// Etiqueta de comparación sugerida para agrupar el mismo ítem entre proveedores distintos:
// minúsculas, sin acentos, espacios colapsados. Es solo un punto de partida — el usuario la puede
// corregir en la revisión si dos proveedores describieron el mismo ítem de forma distinta (ver
// MarketStudyQuotationItem.groupKey).
function suggestGroupKey(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .filter((it) => it && String(it.name || '').trim())
    .map((it) => {
      const name = String(it.name).trim();
      const quantity = it.quantity != null ? Number(it.quantity) : null;
      const unitPrice = it.unitPrice != null ? Number(it.unitPrice) : null;
      const totalPrice = it.totalPrice != null ? Number(it.totalPrice)
        : (quantity != null && unitPrice != null ? quantity * unitPrice : null);
      return {
        name,
        unit: it.unit ? String(it.unit).trim() : null,
        quantity,
        unitPrice,
        totalPrice,
        groupKey: suggestGroupKey(name),
        // Sin precio o cantidad reconocidos no hay con qué comparar este ítem en la matriz: se
        // marca para que el usuario lo revise en vez de mostrarlo como si valiera 0.
        needsReview: quantity == null || unitPrice == null,
      };
    });
}

// Lee una cotización de proveedor (imagen, PDF o Excel) y devuelve los datos sugeridos para que el
// usuario los revise/corrija antes de guardar — igual que scanBudgetItemsFile, nunca persiste
// nada acá. extractionStatus queda en 'revisar' si el proveedor no se pudo leer, o si algún ítem
// quedó marcado needsReview.
async function scanSupplierQuotationFile({ buffer, mimetype, originalname }) {
  const extractor = getExtractor('supplierQuotation');
  const ext = path.extname(originalname || '').toLowerCase();

  let result;
  if (EXCEL_EXTENSIONS.includes(ext)) {
    const text = workbookToText(buffer);
    result = text.trim()
      ? await extractStructuredDataFromText({
        text, instructions: extractor.instructions, schemaDescription: extractor.schemaDescription, maxTokens: extractor.maxTokens,
      })
      : {};
  } else {
    result = await extractStructuredData({
      buffer, mimetype, instructions: extractor.instructions, schemaDescription: extractor.schemaDescription, maxTokens: extractor.maxTokens,
    });
  }

  const items = sanitizeItems(result?.items);
  const supplierName = result?.supplierName ? String(result.supplierName).trim() : null;
  const extractionStatus = (!supplierName || items.length === 0 || items.some((it) => it.needsReview)) ? 'revisar' : 'ok';

  return {
    supplierName,
    deliveryTime: result?.deliveryTime ? String(result.deliveryTime).trim() : null,
    validUntil: result?.validUntil || null,
    paymentTerms: result?.paymentTerms ? String(result.paymentTerms).trim() : null,
    items,
    extractionStatus,
  };
}

module.exports = { scanSupplierQuotationFile, suggestGroupKey };
