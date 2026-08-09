const { runWorker } = require('./invoiceScanService');

// Lectura automática del RUT (Registro Único Tributario, DIAN) 100% local: reutiliza el mismo
// motor de extracción de texto que la lectura de facturas (capa de texto del PDF, o OCR con
// Tesseract si es un escaneo/imagen). Es un apoyo para prellenar el formulario, no un lector
// infalible: el usuario siempre revisa antes de guardar.
//
// El PDF del RUT que genera la DIAN tiene una particularidad al extraerle el texto: primero
// aparece TODO el bloque de etiquetas de los campos ("35. Razón social", "44. Teléfono 1", etc.,
// sin relación de orden con sus valores) y luego, en un bloque aparte, los VALORES diligenciados,
// en el mismo orden relativo de los campos de identificación básica (página 1) pero sin ninguna
// etiqueta al lado. Por eso NO sirve buscar "la etiqueta seguida del valor" como en las facturas;
// hay que anclarse en el patrón del propio valor (NIT dibujado casilla por dígito) o en su
// posición relativa a otro valor ya identificado (ej. el teléfono va justo después del correo).

function findEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// El NIT (y su DV) se dibujan en el PDF como una casilla por dígito, así que en el texto extraído
// quedan como dígitos sueltos separados por espacios (ej. "9 0 0 3 0 3 7 0 1 0"). El bloque de
// etiquetas (antes de los valores) trae varias listas de números de columna con el mismo aspecto
// (ej. "1 2 3 4 5 6 7 8 9 10" en encabezados de tablas), así que buscar la primera racha así en
// todo el documento da falsos positivos. En cambio, el NIT sí queda justo después del "número de
// formulario" (un número largo sin espacios, ej. "141193002164"), que es el primer dato del bloque
// de valores reales: se busca la racha de dígitos separados por espacio a partir de ahí. Si el PDF
// no tiene ese patrón (otro generador, o etiqueta y valor sí quedan juntos), se cae a buscar la
// etiqueta "NIT" seguida del número.
function findNit(text) {
  const formNumberMatch = text.match(/\b\d{8,}\b/);
  const searchFrom = formNumberMatch ? formNumberMatch.index + formNumberMatch[0].length : 0;
  const spaced = text.slice(searchFrom).match(/\b(\d(?:[ \t]+\d){7,9})\b/);
  if (spaced) {
    const digits = spaced[1].replace(/[ \t]+/g, '');
    return digits.length === 10 ? `${digits.slice(0, 9)}-${digits.slice(9)}` : digits;
  }

  const labeled = text.match(/n[uú]mero\s+de\s+identificaci[oó]n\s+tributaria[^\d]{0,30}(\d[\d.,]{6,})/i)
    || text.match(/\bnit\.?\s*:?\s*(\d[\d.,]{6,})/i);
  if (!labeled) return null;
  const nit = labeled[1].replace(/[.,]/g, '');
  const dvMatch = text.slice(labeled.index, labeled.index + 200).match(/\bdv\.?\s*:?\s*(\d)\b/i);
  return dvMatch ? `${nit}-${dvMatch[1]}` : nit;
}

// Teléfono: sin etiqueta cerca en el bloque de valores, pero el teléfono 1 va justo en la línea
// siguiente al correo electrónico (mismo orden del formulario: dirección, correo, teléfono 1 y 2),
// a veces con el teléfono 2 pegado en la misma línea (otros 10 dígitos, sin separador). Si no se
// encuentra por esa vía (ej. otro formato de documento), se intenta con la etiqueta "Teléfono".
function findPhone(lines) {
  const emailIdx = lines.findIndex((l) => /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(l));
  if (emailIdx !== -1) {
    for (let i = emailIdx + 1; i < Math.min(emailIdx + 3, lines.length); i++) {
      const digitsOnly = lines[i].replace(/[\s-]/g, '');
      if (/^\d{7,}$/.test(digitsOnly)) return digitsOnly.length > 10 ? digitsOnly.slice(0, 10) : digitsOnly;
    }
  }
  const m = lines.join('\n').match(/\b(?:tel[eé]fono(?:\s*(?:1|principal|m[oó]vil))?|tel|cel(?:ular)?)\.?[ :]{0,10}\n?[ \t]{0,10}(\+?\d[\d -]{5,}\d)/i);
  return m ? m[1].trim() : null;
}

// Razón social: en un RUT de persona jurídica, el valor queda en la línea siguiente a "Persona
// jurídica" (valor del tipo de contribuyente, que sí conserva su posición justo después del NIT).
// Para persona natural, o si ese patrón no aplica, se intentan los métodos "etiqueta adyacente"
// (funcionan si el PDF sí mantiene etiqueta y valor juntos, como en otros generadores de RUT).
function findName(lines) {
  const pjIdx = lines.findIndex((l) => /persona\s+jur[ií]dica/i.test(l));
  if (pjIdx !== -1) {
    for (let i = pjIdx + 1; i < Math.min(pjIdx + 3, lines.length); i++) {
      if (lines[i] && !/^\d+$/.test(lines[i])) return lines[i];
    }
  }

  const joined = lines.join('\n');
  const razonMatch = joined.match(/raz[oó]n\s+social\s*:?\s*\n?\s*([^\n]{3,150})/i);
  if (razonMatch) {
    const name = razonMatch[1].trim();
    if (name && !/^\d+$/.test(name)) return name;
  }

  const fieldRe = (label) => {
    const m = joined.match(new RegExp(`${label}\\s*:?\\s*\\n?\\s*([^\\n]{1,60})`, 'i'));
    return m ? m[1].trim() : '';
  };
  const parts = [
    fieldRe('primer\\s+nombre'),
    fieldRe('otros\\s+nombres'),
    fieldRe('primer\\s+apellido'),
    fieldRe('segundo\\s+apellido'),
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function parseRutText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    name: findName(lines),
    nit: findNit(text),
    email: findEmail(text),
    phone: findPhone(lines),
    rawText: text,
  };
}

async function scanRut(buffer, mimetype) {
  const text = await runWorker(buffer, mimetype);
  const parsed = parseRutText(text);
  return { ...parsed, textLength: text.length };
}

module.exports = { scanRut, parseRutText };
