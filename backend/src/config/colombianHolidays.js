// Calculadora de festivos de Colombia (Ley 51 de 1983, "Ley Emiliani"): los festivos que no caen
// en lunes se trasladan al lunes siguiente, salvo Jueves y Viernes Santo (fijos por ser festivos
// religiosos de fecha móvil ligada directamente a la Pascua, nunca se trasladan). Esto SIEMBRA la
// tabla PublicHoliday (editable desde Administración) — el cálculo de nómina nunca vuelve a correr
// este algoritmo, siempre lee de la tabla, así que si algún año cambia la norma basta con editar el
// registro ahí, sin tocar código (ver la especificación de "calendario de festivos configurable").
// Esto es un cálculo de referencia, no asesoría legal: revisar/ajustar en el catálogo si hace falta.

// Algoritmo de Gauss para el domingo de Pascua (calendario gregoriano).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Traslada al lunes siguiente (Ley Emiliani) — si la fecha ya es lunes, queda igual.
function nextMonday(date) {
  const d = new Date(date);
  const dow = d.getUTCDay(); // 0 = domingo
  const diff = (8 - dow) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

const FIXED_HOLIDAYS = [
  [0, 1, 'Año Nuevo'],
  [4, 1, 'Día del Trabajo'],
  [6, 20, 'Día de la Independencia'],
  [7, 7, 'Batalla de Boyacá'],
  [11, 8, 'Inmaculada Concepción'],
  [11, 25, 'Navidad'],
];

const EMILIANI_HOLIDAYS = [
  [0, 6, 'Día de los Reyes Magos'],
  [2, 19, 'Día de San José'],
  [5, 29, 'San Pedro y San Pablo'],
  [7, 15, 'Asunción de la Virgen'],
  [9, 12, 'Día de la Raza'],
  [10, 1, 'Día de Todos los Santos'],
  [10, 11, 'Independencia de Cartagena'],
];

function computeColombianHolidays(year) {
  const easter = easterSunday(year);
  const holidays = [];
  FIXED_HOLIDAYS.forEach(([m, d, name]) => holidays.push({ date: new Date(Date.UTC(year, m, d)), name }));
  EMILIANI_HOLIDAYS.forEach(([m, d, name]) => holidays.push({ date: nextMonday(new Date(Date.UTC(year, m, d))), name }));
  holidays.push({ date: addDays(easter, -3), name: 'Jueves Santo' });
  holidays.push({ date: addDays(easter, -2), name: 'Viernes Santo' });
  holidays.push({ date: nextMonday(addDays(easter, 39)), name: 'Ascensión del Señor' });
  holidays.push({ date: nextMonday(addDays(easter, 60)), name: 'Corpus Christi' });
  holidays.push({ date: nextMonday(addDays(easter, 68)), name: 'Sagrado Corazón de Jesús' });
  return holidays
    .map((h) => ({ date: h.date.toISOString().slice(0, 10), name: h.name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { computeColombianHolidays };
