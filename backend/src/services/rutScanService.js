const { runWorker } = require('./invoiceScanService');

// Lectura automática del RUT (Registro Único Tributario, DIAN) 100% local: reutiliza el mismo
// motor de extracción de texto que la lectura de facturas (capa de texto del PDF, o OCR con
// Tesseract si es un escaneo/imagen) y aplica heurísticas de texto propias del formato del RUT.
// Es un apoyo para prellenar el formulario, no un lector infalible: el usuario siempre revisa
// antes de guardar (por eso se devuelven también null en los campos que no se lograron reconocer).

function findEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// "Teléfono 1"/"Teléfono Principal"/"Teléfono Móvil"/"Celular", abreviado o completo. En el RUT
// suele venir la etiqueta en una línea y el número en la siguiente; el número capturado no cruza
// más de un salto de línea, para no arrastrar pie de página u otro texto no relacionado.
function findPhone(text) {
  const m = text.match(/\b(?:tel[eé]fono(?:\s*(?:1|principal|m[oó]vil))?|tel|cel(?:ular)?)\.?[ :]{0,10}\n?[ \t]{0,10}(\+?\d[\d -]{5,}\d)/i);
  return m ? m[1].trim() : null;
}

// NIT: casilla "Número de Identificación Tributaria (NIT)" o etiqueta corta "NIT", seguido del
// número (9-10 dígitos); el dígito de verificación (DV), si aparece, se agrega como sufijo
// "-DV" (formato NIT-DV usual en Colombia, ej. "900303701-7").
function findNit(text) {
  const nitMatch = text.match(/n[uú]mero\s+de\s+identificaci[oó]n\s+tributaria[^\d]{0,30}(\d[\d.,]{6,})/i)
    || text.match(/\bnit\.?\s*:?\s*(\d[\d.,]{6,})/i);
  if (!nitMatch) return null;
  const nit = nitMatch[1].replace(/[.,]/g, '');
  const dvMatch = text.slice(nitMatch.index, nitMatch.index + 200).match(/\bdv\.?\s*:?\s*(\d)\b/i);
  return dvMatch ? `${nit}-${dvMatch[1]}` : nit;
}

// Razón social (persona jurídica) o, si no aparece, nombre completo armado a partir de los
// campos de persona natural (primer/segundo apellido, primer/otros nombres).
function findName(text) {
  const razonMatch = text.match(/raz[oó]n\s+social\s*:?\s*\n?\s*([^\n]{3,150})/i);
  if (razonMatch) {
    const name = razonMatch[1].trim();
    if (name && !/^\d+$/.test(name)) return name;
  }

  const fieldRe = (label) => {
    const m = text.match(new RegExp(`${label}\\s*:?\\s*\\n?\\s*([^\\n]{1,60})`, 'i'));
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
  return {
    name: findName(text),
    nit: findNit(text),
    email: findEmail(text),
    phone: findPhone(text),
    rawText: text,
  };
}

async function scanRut(buffer, mimetype) {
  const text = await runWorker(buffer, mimetype);
  const parsed = parseRutText(text);
  return { ...parsed, textLength: text.length };
}

module.exports = { scanRut, parseRutText };
