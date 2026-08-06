const { Worker } = require('worker_threads');
const path = require('path');

// Lectura automática de facturas (PDF o imagen) 100% local: sin proveedor de IA externo.
// Extrae el texto (capa de texto del PDF, o OCR con Tesseract si es un escaneo/imagen) y aplica
// heurísticas de texto para adivinar proveedor, NIT, fecha, subtotal, IVA y total. Es un apoyo
// para digitar más rápido, no un lector infalible: el usuario siempre revisa antes de guardar.
function runWorker(buffer, mimetype, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '../workers/invoiceScanWorker.js'), {
      workerData: { buffer, mimetype },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('La factura tardó demasiado en procesarse (archivo muy grande, escaneo de baja calidad, o corrupto).'));
    }, timeoutMs);

    worker.once('message', (msg) => {
      clearTimeout(timer);
      worker.terminate();
      if (msg.ok) resolve(msg.text);
      else reject(new Error(msg.error));
    });

    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Error procesando la factura: ${err.message}`));
    });
  });
}

// Convierte un monto en texto (formato colombiano "1.234.567,89" o variantes) a número.
function parseMoneyLoose(str) {
  if (str === undefined || str === null) return null;
  let s = String(str).trim().replace(/[^\d.,]/g, '');
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    s = parts[parts.length - 1].length <= 2 && parts.length === 2
      ? parts.join('.')
      : s.replace(/,/g, '');
  } else if (hasDot) {
    const parts = s.split('.');
    if (!(parts.length === 2 && parts[1].length <= 2)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function findDate(text) {
  // dd/mm/yyyy o dd-mm-yyyy, cerca de la palabra "Fecha" si aparece; si no, el primero que haya.
  const nearFecha = text.match(/fecha[^\n\d]{0,20}(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i);
  const anyDmy = nearFecha || text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (anyDmy) {
    let [, d, m, y] = anyDmy;
    if (y.length === 2) y = `20${y}`;
    d = d.padStart(2, '0'); m = m.padStart(2, '0');
    if (Number(m) <= 12 && Number(d) <= 31) return `${y}-${m}-${d}`;
  }
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

// Último número de una línea que no sea un porcentaje (ej. en "IVA 19%: 14.250" evita el "19").
function lastMoneyOnLine(line) {
  const numbers = [...line.matchAll(/\d[\d.,]*/g)];
  if (!numbers.length) return null;
  const nonPercent = numbers.filter((m) => line[m.index + m[0].length] !== '%');
  const candidates = nonPercent.length ? nonPercent : numbers;
  return parseMoneyLoose(candidates[candidates.length - 1][0]);
}

// Busca todas las líneas que coincidan con keywordRegex (y no con excludeRegex) y toma el monto
// de la última coincidencia (los totales suelen repetirse o aparecer más de una vez; el valor
// real casi siempre está al final del documento).
function findMoneyOnLastLineWith(lines, keywordRegex, excludeRegex) {
  const matches = lines.filter((l) => keywordRegex.test(l) && !(excludeRegex && excludeRegex.test(l)));
  if (!matches.length) return null;
  return lastMoneyOnLine(matches[matches.length - 1]);
}

const HEADER_LINE_RE = /^(factura|invoice|proveedor|raz[oó]n social|vendedor|emisor|nit|fecha|cliente|no\.?\s*\d|orden de compra|remisi[oó]n)\b/i;

function findVendorName(lines) {
  const labelLine = lines.find((l) => /^(proveedor|raz[oó]n social|vendedor|emisor)\b/i.test(l));
  if (labelLine) {
    const afterLabel = labelLine.replace(/^(proveedor|raz[oó]n social|vendedor|emisor)\s*:?\s*/i, '').trim();
    if (afterLabel) return { name: afterLabel, line: labelLine };
  }
  // si no hay etiqueta explícita, se asume que el nombre del proveedor está en las primeras
  // líneas (encabezado típico de una factura), evitando líneas que son solo números/etiquetas.
  const candidate = lines.slice(0, 6).find((l) => {
    if (l.length < 4) return false;
    if (HEADER_LINE_RE.test(l)) return false;
    if (/^\d+$/.test(l)) return false;
    return true;
  });
  return candidate ? { name: candidate, line: candidate } : { name: null, line: null };
}

// Ítems: las líneas antes de la sección de subtotal/total, quitando las que ya se identificaron
// como encabezado (proveedor, NIT, fecha, etc.). Se entrega como texto libre editable (no como
// tabla estructurada): con OCR local el reconocimiento de columnas no es confiable, así que se
// prioriza que el usuario pueda leerlo y corregirlo fácilmente.
function findItemsText(lines, vendorLine) {
  const totalsIdx = lines.findIndex((l) => /(sub)?total/i.test(l));
  const end = totalsIdx >= 0 ? totalsIdx : lines.length;
  const body = lines.slice(0, end).filter((l) => l !== vendorLine && !HEADER_LINE_RE.test(l));
  return body.join('\n');
}

function parseInvoiceText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const subtotal = findMoneyOnLastLineWith(lines, /subtotal/i);
  const taxAmount = findMoneyOnLastLineWith(lines, /i\.?v\.?a\.?\b/i);
  const total = findMoneyOnLastLineWith(lines, /\btotal\b/i, /subtotal/i);

  const nitMatch = text.match(/n\.?i\.?t\.?\s*:?\s*([\d.,-]{5,})/i);
  const vendor = findVendorName(lines);

  return {
    vendorName: vendor.name,
    vendorNit: nitMatch ? nitMatch[1].trim() : null,
    date: findDate(text),
    subtotal,
    taxAmount,
    total,
    itemsText: findItemsText(lines, vendor.line),
    rawText: text,
  };
}

async function scanInvoice(buffer, mimetype) {
  const text = await runWorker(buffer, mimetype);
  const parsed = parseInvoiceText(text);
  return { ...parsed, textLength: text.length };
}

module.exports = { scanInvoice, parseInvoiceText, parseMoneyLoose };
