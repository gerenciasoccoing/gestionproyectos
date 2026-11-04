// Convierte un número a su escritura en letras, en español — no existía ningún helper así en el
// código (se buscó exhaustivamente antes de escribir este). Usado por los comprobantes de egreso
// e ingreso (ver pdfService.js) para la línea "Son: ___ PESOS M/CTE" que exige la especificación.
// Cobertura: 0 hasta 999.999.999.999 (más que suficiente para cualquier monto real de la app) con
// las reglas propias del español (apócope de "uno"→"un", "veintiún", "ciento" vs "cien",
// "millón"/"millones", "mil" sin "un" delante).

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIECIS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const VEINTIS = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

// Tramo de 0-999, SIN apócope final (se aplica después, según el contexto: "un" vs "uno").
function hundredsToWords(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let out = c > 0 ? CENTENAS[c] : '';
  if (resto > 0) {
    out += out ? ' ' : '';
    if (resto < 10) out += UNIDADES[resto];
    else if (resto < 20) out += DIECIS[resto - 10];
    else if (resto < 30) out += VEINTIS[resto - 20];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      out += DECENAS[d] + (u > 0 ? ` y ${UNIDADES[u]}` : '');
    }
  }
  return out;
}

// Aplica el apócope "uno"→"un" al ÚLTIMO término de una frase (ej. "veintiuno"→"veintiún",
// "treinta y uno"→"treinta y un") — solo tiene sentido delante de un sustantivo (mil/millón/pesos),
// nunca al final absoluto de un número (ej. "el número es 21" sí dice "veintiuno").
function apocopate(phrase) {
  // "veintiuno"→"veintiún" primero (con tilde, caso especial): si se aplicara el reemplazo
  // genérico de "uno"→"un" primero, "veintiuno" quedaría como "veintiun" sin tilde.
  if (phrase.endsWith('veintiuno')) return `${phrase.slice(0, -'veintiuno'.length)}veintiún`;
  return phrase.replace(/uno$/, 'un');
}

function integerToWords(n) {
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;

  const partes = [];
  if (millones > 0) {
    const millonesWords = millones === 1 ? 'un millón' : `${apocopate(hundredsToWords(millones))} millones`;
    partes.push(millonesWords);
  }
  if (miles > 0) {
    const milesWords = miles === 1 ? 'mil' : `${apocopate(hundredsToWords(miles))} mil`;
    partes.push(milesWords);
  }
  if (resto > 0) {
    partes.push(hundredsToWords(resto));
  }
  return partes.join(' ').trim();
}

// "Son: DOSCIENTOS CINCUENTA MIL PESOS M/CTE" (o "...CON 50/100" si trae centavos) — el formato
// que normalmente llevan los comprobantes de caja en Colombia. amount puede venir con decimales
// (DECIMAL(18,2) en la base de datos); los centavos se escriben como fracción, no en letras
// (convención estándar, evita frases como "con cincuenta centavos de peso" que no se usan en la
// práctica contable).
function moneyToWords(amount) {
  const value = Math.abs(Number(amount) || 0);
  const pesos = Math.floor(value);
  const centavos = Math.round((value - pesos) * 100);
  const raw = integerToWords(pesos);
  // "PESOS" es un sustantivo justo después: el último término (si termina en "uno") se apocopa acá
  // también ("veintiún pesos", "un millón de pesos"), no solo entre "mil"/"millones" internos.
  const pesosWords = apocopate(raw).toUpperCase();
  // "de" entre "millón/millones" y el sustantivo que sigue, SOLO cuando es la última palabra del
  // número (ej. "un millón de pesos", "dos millones de pesos" — pero "un millón quinientos mil
  // pesos" nunca lleva "de", porque "millón" no es lo último).
  const needsDe = /(millón|millones)$/.test(raw);
  // "un peso" en singular cuando el monto es exactamente 1 — único caso donde "pesos" no aplica.
  const noun = pesos === 1 ? 'PESO' : 'PESOS';
  const centavosSuffix = centavos > 0 ? ` CON ${String(centavos).padStart(2, '0')}/100` : '';
  return `SON: ${pesosWords}${needsDe ? ' DE' : ''} ${noun}${centavosSuffix} M/CTE`;
}

module.exports = { integerToWords, moneyToWords };
