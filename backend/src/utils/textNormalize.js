// Normalización de texto para deduplicar materiales (ver Material.js) — "Cemento gris 50kg" y
// "cemento  gris 50 kg." deben volverse el MISMO string normalizado (ver CRITERIOS DE CALIDAD de la
// especificación: ese es el caso de prueba exacto). Minúsculas, sin tildes/diacríticos, sin
// puntuación final (un punto, coma o punto y coma sueltos al final, típico de copiar/pegar de un
// Excel o un PDF) y SIN NINGÚN espacio interno (no solo los dobles colapsados a uno): la prueba de
// calidad de arriba solo se cumple quitando el espacio entre "50" y "kg" — un espacio de más o de
// menos alrededor de una unidad pegada al nombre es exactamente el tipo de diferencia cosmética que
// se espera tratar como "el mismo material".
function normalizeMaterialText(value) {
  let s = String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes/diacríticos
    .toLowerCase()
    .trim();
  s = s.replace(/[\s.,;:]+$/, ''); // puntuación final, incluso si le quedó un espacio antes (ej. "50 kg . ")
  s = s.replace(/\s+/g, ''); // colapsa TODO espacio interno, no solo los dobles
  return s;
}

module.exports = { normalizeMaterialText };
