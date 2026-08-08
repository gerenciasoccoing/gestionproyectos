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

// Líneas de metadatos/encabezado que NUNCA son un ítem ni el nombre del proveedor. Se amplió
// específicamente para el formato de factura electrónica DIAN (muy común en Colombia), que trae
// muchas líneas de metadatos (No de Factura, autorización, datos del receptor, CUFE, etc.) que
// antes se colaban como si fueran ítems de la compra.
const HEADER_LINE_RE = /^(factura|invoice|proveedor|raz[oó]n social|nombre\/raz[oó]n social|vendedor|emisor|nit|fecha|cliente|no\.?\s*\d|no\s+de\s+factura|orden de compra|remisi[oó]n|tel[eé]fono|tel\.?\b|cel(?:ular)?\.?|correo|e-?mail|email\.?|direcci[oó]n|autorizaci[oó]n|datos del receptor|forma de pago|medio de pago|total de l[ií]neas|cufe|son|notas|firma digital|plataforma|software|esta factura|representaci[oó]n gr[aá]fica|r[eé]gimen|tipo de persona|moneda)\b/i;

function findVendorName(lines) {
  const labelLine = lines.find((l) => /^(proveedor|raz[oó]n social|vendedor|emisor)\b/i.test(l));
  if (labelLine) {
    const afterLabel = labelLine.replace(/^(proveedor|raz[oó]n social|vendedor|emisor)\s*:?\s*/i, '').trim();
    if (afterLabel) return { name: afterLabel, lines: [labelLine] };
  }
  // si no hay etiqueta explícita, se asume que el nombre del proveedor está en las primeras
  // líneas (encabezado típico de una factura), evitando líneas que son solo números/etiquetas.
  const startIdx = lines.slice(0, 6).findIndex((l) => {
    if (l.length < 4) return false;
    if (HEADER_LINE_RE.test(l)) return false;
    if (/^\d+$/.test(l)) return false;
    return true;
  });
  if (startIdx === -1) return { name: null, lines: [] };
  // el nombre/razón social a veces se parte en 2 líneas (texto en mayúsculas envuelto en el PDF);
  // se van agregando mientras siga viéndose como continuación del nombre.
  const nameLines = [lines[startIdx]];
  for (let i = startIdx + 1; i < Math.min(startIdx + 3, lines.length); i++) {
    const l = lines[i];
    if (!l || l.length < 3 || HEADER_LINE_RE.test(l) || /^\d+$/.test(l)) break;
    if (l === l.toUpperCase() && l.length < 60) nameLines.push(l);
    else break;
  }
  return { name: nameLines.join(' '), lines: nameLines };
}

// Ítems: las líneas antes de la sección de subtotal/total, quitando las que ya se identificaron
// como encabezado (proveedor, NIT, fecha, etc.). "Total de líneas" (metadato DIAN, no un total de
// dinero) se excluye explícitamente para no cortar la búsqueda antes de llegar a los ítems reales.
function itemLines(lines, vendorLines) {
  const totalsIdx = lines.findIndex((l) => /(sub)?total\b/i.test(l) && !/total\s+de\s+l[ií]neas/i.test(l));
  const end = totalsIdx >= 0 ? totalsIdx : lines.length;
  return lines.slice(0, end).filter((l) => !vendorLines.includes(l) && !HEADER_LINE_RE.test(l));
}

// Interpreta una línea de ítem "simple" (todo en una sola línea) como
// {descripción, cantidad, valor unitario, valor total}. Convención asumida (la más común): los
// últimos 3 números de la línea son cantidad, valor unitario y valor total, en ese orden; si solo
// hay 2, se asume cantidad=1. Las fracciones tipo "1/2" (ej. "VARILLA 1/2 PULG") se tratan como
// texto, no como números.
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

// Tabla de ítems estilo factura electrónica DIAN: encabezado "... DESCRIPCIÓN ... CANTIDAD ...",
// donde cada ítem puede venir partido en varias líneas (código y descripción envueltos por el
// PDF) y las columnas numéricas (cantidad, precio unitario, impuesto, descuento, total) quedan
// todas juntas en UNA línea con montos "$X.XXX,XX". Se agrupan las líneas de texto previas a esa
// línea de números como la descripción del ítem.
function findDianItemsTable(lines) {
  const headerIdx = lines.findIndex((l) => /descripci[oó]n/i.test(l) && /cantidad/i.test(l));
  if (headerIdx === -1) return null;

  let start = headerIdx + 1;
  // subencabezado de columnas de impuestos (ej. "NOM. % o VAL MONTO"), si aparece, se salta.
  if (lines[start] && /^nom\.?\s*%/i.test(lines[start])) start += 1;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^subtotal\b/i.test(lines[i]) || /^impuesto\b/i.test(lines[i])) { end = i; break; }
  }

  const items = [];
  let buffer = [];
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (!line.includes('$')) { buffer.push(line); continue; }

    const moneyMatches = [...line.matchAll(/\$[\d.,]+/g)];
    if (!moneyMatches.length) { buffer = []; continue; }
    const unitPrice = parseMoneyLoose(moneyMatches[0][0]);
    const totalPrice = parseMoneyLoose(moneyMatches[moneyMatches.length - 1][0]);
    const beforeMoney = line.slice(0, moneyMatches[0].index);
    const plainNums = [...beforeMoney.matchAll(/\d[\d.,]*/g)];
    const quantity = plainNums.length ? (parseMoneyLoose(plainNums[plainNums.length - 1][0]) ?? 1) : 1;

    let description;
    if (buffer.length) {
      // el código interno del ítem suele venir en minúsculas y envuelto en varias líneas antes
      // de la descripción real, que va en mayúsculas (convención DIAN); si hay líneas en
      // mayúsculas se usan solo esas, para no mezclar el código con el texto de la descripción.
      const stripped = buffer.map((l) => l.replace(/^\s*\d+\s+/, '').trim()).filter(Boolean);
      const upperLines = stripped.filter((l) => l === l.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(l));
      description = (upperLines.length ? upperLines : stripped).join(' ').trim();
    } else if (plainNums.length) {
      const lastNum = plainNums[plainNums.length - 1];
      description = (beforeMoney.slice(0, lastNum.index) + beforeMoney.slice(lastNum.index + lastNum[0].length))
        .replace(/^\s*\d+\s+/, '').trim();
    } else {
      description = beforeMoney.replace(/^\s*\d+\s+/, '').trim();
    }
    description = description.replace(/\s+/g, ' ').trim() || '(sin descripción)';

    if (totalPrice !== null) items.push({ description, quantity, unitPrice: unitPrice ?? totalPrice, totalPrice });
    buffer = [];
  }
  return items;
}

function findItems(lines, vendorLines) {
  const dianItems = findDianItemsTable(lines);
  if (dianItems && dianItems.length) return dianItems;
  return itemLines(lines, vendorLines).map(parseItemLine).filter(Boolean);
}

const TAX_LABELS = [
  { name: 'IVA', re: /\bi\.?v\.?a\.?\b/i },
  { name: 'ReteIVA', re: /\breteiva\b|\bretenci[oó]n\s+de\s+iva\b/i },
  { name: 'ReteICA', re: /\breteica\b/i },
  { name: 'ICA', re: /\bica\b/i },
  { name: 'Retención en la fuente', re: /\bretefuente\b|\breterenta\b|\bretenci[oó]n\s+en\s+la\s+fuente\b/i },
  { name: 'Impoconsumo', re: /\bimpoconsumo\b/i },
];

// Impuestos que componen la factura: una línea por cada tipo reconocido (IVA, ICA, retenciones,
// etc.), con su tarifa (%) si aparece y el monto. Distintos tipos pueden coexistir en una
// factura. Se prefiere la línea con tarifa (%) y monto (el detalle, ej. "01 IVA ... 19,00% ...")
// sobre una simple mención sin cifra (ej. "... impuesto sobre las ventas − IVA" en el encabezado).
function findTaxes(lines) {
  const taxes = [];
  const usedIdx = new Set();
  for (const { name, re } of TAX_LABELS) {
    const candidates = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => re.test(l) && !usedIdx.has(i)
        && !((name === 'IVA') && /reteiva/i.test(l))
        && !((name === 'ICA') && /reteica/i.test(l)));
    if (!candidates.length) continue;
    const withRate = candidates.filter(({ l }) => lastMoneyOnLine(l) !== null && /%/.test(l));
    const withAmount = candidates.filter(({ l }) => lastMoneyOnLine(l) !== null);
    const chosen = withRate.length ? withRate[withRate.length - 1] : (withAmount.length ? withAmount[withAmount.length - 1] : null);
    if (!chosen) continue;
    usedIdx.add(chosen.i);
    const amount = lastMoneyOnLine(chosen.l);
    const rateMatch = chosen.l.match(/(\d{1,2}(?:[.,]\d+)?)\s*%/);
    taxes.push({ name, rate: rateMatch ? parseFloat(rateMatch[1].replace(',', '.')) : null, amount });
  }
  return taxes;
}

// Impuestos que efectivamente incrementan el total de la factura (Subtotal + estos = Total).
// Las retenciones (ReteIVA, ReteICA, retención en la fuente) NO suman al total: se descuentan del
// pago neto, así que no deben mezclarse en el campo agregado de "impuestos" del gasto.
const ADDED_TAX_NAMES = new Set(['IVA', 'ICA', 'Impoconsumo']);

function findPhone(text) {
  // "Tel[éfono]" o "Cel[ular]", abreviado o completo; se toma la PRIMERA aparición en el texto
  // (normalmente la del proveedor/emisor, que va antes que la del cliente/receptor).
  // El número puede ir en la misma línea que la etiqueta o en la siguiente (formularios con campo
  // en una línea y valor en la otra); en cualquier caso el número capturado no cruza más de un
  // salto de línea, para no arrastrar pie de página u otro texto no relacionado.
  const m = text.match(/\b(?:tel[eé]fono|tel|cel(?:ular)?)\.?[ :]{0,10}\n?[ \t]{0,10}(\+?\d[\d -]{5,}\d)/i);
  return m ? m[1].trim() : null;
}

function findEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function parseInvoiceText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const subtotal = findMoneyOnLastLineWith(lines, /subtotal/i);
  const total = findMoneyOnLastLineWith(lines, /\btotal\b/i, /subtotal|total\s+de\s+l[ií]neas/i);
  const taxes = findTaxes(lines);
  const addedTaxes = taxes.filter((t) => ADDED_TAX_NAMES.has(t.name));
  const taxAmount = taxes.length
    ? (addedTaxes.length ? addedTaxes : taxes).reduce((s, t) => s + t.amount, 0)
    : null;

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
    items: findItems(lines, vendor.lines),
    rawText: text,
  };
}

async function scanInvoice(buffer, mimetype) {
  const text = await runWorker(buffer, mimetype);
  const parsed = parseInvoiceText(text);
  return { ...parsed, textLength: text.length };
}

module.exports = { scanInvoice, parseInvoiceText, parseMoneyLoose, runWorker };
