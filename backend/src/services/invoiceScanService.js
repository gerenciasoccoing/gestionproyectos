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

const HEADER_LINE_RE = /^(factura|invoice|proveedor|raz[oó]n social|vendedor|emisor|nit|fecha|cliente|no\.?\s*\d|orden de compra|remisi[oó]n|tel[eé]fono|cel(?:ular)?\.?|correo|e-?mail|direcci[oó]n)\b/i;

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
// como encabezado (proveedor, NIT, fecha, etc.).
function itemLines(lines, vendorLine) {
  const totalsIdx = lines.findIndex((l) => /(sub)?total/i.test(l));
  const end = totalsIdx >= 0 ? totalsIdx : lines.length;
  return lines.slice(0, end).filter((l) => l !== vendorLine && !HEADER_LINE_RE.test(l));
}

// Interpreta una línea de ítem como {descripción, cantidad, valor unitario, valor total}.
// Convención asumida (la más común): los últimos 3 números de la línea son
// cantidad, valor unitario y valor total, en ese orden; si solo hay 2, se asume cantidad=1.
// Las fracciones tipo "1/2" (ej. "VARILLA 1/2 PULG") se tratan como texto, no como números.
function parseItemLine(line) {
  const masked = line.replace(/\d+\/\d+/g, (m) => '#'.repeat(m.length));
  const numMatches = [...masked.matchAll(/\d[\d.,]*/g)];
  if (!numMatches.length) return null;
  const nums = numMatches.map((m) => m[0]);
  const description = line.slice(0, numMatches[0].index).trim() || line.trim();

  let quantity = 1;
  let unitPrice = null;
  let totalPrice = null;
  if (nums.length === 1) {
    totalPrice = parseMoneyLoose(nums[0]);
    unitPrice = totalPrice;
  } else if (nums.length === 2) {
    unitPrice = parseMoneyLoose(nums[0]);
    totalPrice = parseMoneyLoose(nums[1]);
  } else {
    const last3 = nums.slice(-3);
    quantity = parseMoneyLoose(last3[0]) ?? 1;
    unitPrice = parseMoneyLoose(last3[1]);
    totalPrice = parseMoneyLoose(last3[2]);
  }
  if (!totalPrice) return null;
  if (unitPrice === null) unitPrice = quantity ? totalPrice / quantity : totalPrice;
  return { description, quantity, unitPrice, totalPrice };
}

function findItems(lines, vendorLine) {
  return itemLines(lines, vendorLine).map(parseItemLine).filter(Boolean);
}

const TAX_LABELS = [
  { name: 'IVA', re: /\bi\.?v\.?a\.?\b/i },
  { name: 'ReteIVA', re: /\breteiva\b|\bretenci[oó]n\s+de\s+iva\b/i },
  { name: 'ReteICA', re: /\breteica\b/i },
  { name: 'ICA', re: /\bica\b/i },
  { name: 'Retención en la fuente', re: /\bretefuente\b|\bretenci[oó]n\s+en\s+la\s+fuente\b/i },
  { name: 'Impoconsumo', re: /\bimpoconsumo\b/i },
];

// Impuestos que componen la factura: una línea por cada tipo reconocido (IVA, ICA, retenciones,
// etc.), con su tarifa (%) si aparece y el monto. Distinto tipos pueden coexistir en una factura.
function findTaxes(lines) {
  const taxes = [];
  const used = new Set();
  for (const { name, re } of TAX_LABELS) {
    const line = lines.find((l, i) => re.test(l) && !used.has(i) && !((name === 'IVA') && /reteiva/i.test(l)) && !((name === 'ICA') && /reteica/i.test(l)));
    if (!line) continue;
    used.add(lines.indexOf(line));
    const amount = lastMoneyOnLine(line);
    if (amount === null) continue;
    const rateMatch = line.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
    taxes.push({ name, rate: rateMatch ? parseFloat(rateMatch[1].replace(',', '.')) : null, amount });
  }
  return taxes;
}

function findPhone(text) {
  const m = text.match(/tel[eé]fono[^\d]{0,10}(\+?\d[\d\s-]{6,}\d)/i) || text.match(/\bcel(?:ular)?\.?[^\d]{0,10}(\+?\d[\d\s-]{6,}\d)/i);
  return m ? m[1].trim() : null;
}

function findEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function parseInvoiceText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const subtotal = findMoneyOnLastLineWith(lines, /subtotal/i);
  const total = findMoneyOnLastLineWith(lines, /\btotal\b/i, /subtotal/i);
  const taxes = findTaxes(lines);
  const taxAmount = taxes.length ? taxes.reduce((s, t) => s + t.amount, 0) : null;

  const nitMatch = text.match(/n\.?i\.?t\.?\s*:?\s*([\d.,-]{5,})/i);
  const vendor = findVendorName(lines);

  return {
    vendorName: vendor.name,
    vendorNit: nitMatch ? nitMatch[1].trim() : null,
    vendorPhone: findPhone(text),
    vendorEmail: findEmail(text),
    date: findDate(text),
    subtotal,
    taxAmount,
    taxes,
    total,
    items: findItems(lines, vendor.line),
    rawText: text,
  };
}

async function scanInvoice(buffer, mimetype) {
  const text = await runWorker(buffer, mimetype);
  const parsed = parseInvoiceText(text);
  return { ...parsed, textLength: text.length };
}

module.exports = { scanInvoice, parseInvoiceText, parseMoneyLoose };
