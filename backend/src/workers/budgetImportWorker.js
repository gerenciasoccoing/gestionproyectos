// Worker thread aislado para parsear el Excel de presupuesto + APU subido por el usuario.
// Igual que priceImportWorker.js: aísla la librería `xlsx` (vulnerable ante archivos no
// confiables) en un proceso hijo con timeout (ver budgetImportService.js), y además hace aquí
// todo el parseo pesado (129.000+ filas típicas) para no cruzar ese volumen crudo por
// postMessage; solo se devuelve la estructura ya condensada.
const { parentPort, workerData } = require('worker_threads');
const XLSX = require('xlsx');

const ITEMS_SHEET_CANDIDATES = ['Items de Presupuesto', 'Ítems de Presupuesto', 'Items de presupuesto', 'Ítems de presupuesto'];
const APU_SHEET_CANDIDATES = ['Unitarios', 'APU', 'Analisis Unitarios', 'Análisis Unitarios'];

function findSheet(workbook, candidates) {
  for (const name of candidates) {
    if (workbook.Sheets[name]) return workbook.Sheets[name];
  }
  // Coincidencia flexible por si el nombre real trae variaciones de mayúsculas/espacios.
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const target = candidates.map(norm);
  const match = workbook.SheetNames.find((n) => target.includes(norm(n)));
  return match ? workbook.Sheets[match] : null;
}

function parseMoney(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseNum(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Recorre la hoja "Ítems de Presupuesto": columnas Item, Descripción, Unidad, Cantidad,
// Vr. Unitario, Vr Parcial, [código de APU] (encabezado variable, se toma la última columna).
function parseBudgetItemsSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  const headerIdx = rows.findIndex((r) => String(r[0]).trim().toLowerCase() === 'item' && String(r[1]).trim().toLowerCase().startsWith('descrip'));
  if (headerIdx === -1) throw new Error('No se encontró la fila de encabezados (Item, Descripción, Unidad...) en la hoja de ítems de presupuesto.');

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const description = String(r[1] || '').trim();
    const unit = String(r[2] || '').trim();
    const apuCode = String(r[6] || '').trim();
    if (!description || !unit || !apuCode) continue; // filas de capítulo/sección sin insumo propio
    const quantity = parseNum(r[3]);
    items.push({ itemCode: String(r[0] || '').trim(), description, unit, quantity, apuCode });
  }
  return items;
}

// Recorre la hoja "Unitarios": bloques ITEM -> Código/Descripción/Unidad/Tipo, con secciones
// Material / Personal / Equipos y una fila final "Total Unitario". Ver budgetImportService.js
// para las fórmulas de costo que reproducen las columnas Precio/Rendimiento/Parcial.
function parseApuBlocksSheet(sheet, neededCodes) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  const blocks = {};

  let i = 0;
  while (i < rows.length) {
    const isBlockHeader = rows[i - 1]
      && String(rows[i - 1][0]).trim() === 'Código'
      && String(rows[i - 1][1]).trim() === 'Descripción';
    if (!isBlockHeader) { i++; continue; }

    const r = rows[i];
    const code = String(r[0] || '').trim();
    const description = String(r[1] || '').trim();
    const unit = String(r[2] || '').trim();
    const tipo = String(r[3] || '').trim();

    let j = i + 1;
    let section = null;
    const materials = [];
    const personal = [];
    const equipos = [];
    while (j < rows.length) {
      const rr = rows[j];
      const a = String(rr[0] || '').trim();
      if (a === 'ITEM') break;
      if (a === 'Material') { section = 'material'; j++; continue; }
      if (a === 'Personal') { section = 'personal'; j++; continue; }
      if (a === 'Equipos') { section = 'equipos'; j++; continue; }
      if (a === 'Codigo') { j++; continue; }
      if (!a && !rr[1]) { j++; continue; }
      // Columna F (índice 5): "Cant + Desp" en Material, "Rendimiento" en Personal/Equipos.
      const qty = parseNum(rr[5]);
      const precio = parseMoney(rr[6]);
      const parcial = parseMoney(rr[7]);
      const entry = { code: a, name: String(rr[1] || '').trim(), unit: String(rr[2] || '').trim(), qty, precio, parcial };
      if (section === 'material' && entry.code) materials.push(entry);
      if (section === 'personal' && entry.code) personal.push(entry);
      if (section === 'equipos' && entry.code) equipos.push(entry);
      j++;
    }

    // Solo interesan los bloques efectivamente referenciados por algún ítem de presupuesto.
    if (neededCodes.has(code)) {
      const hasComponents = materials.length + personal.length + equipos.length > 0;
      // Algunos códigos aparecen duplicados en el archivo fuente (dato repetido sin desglose);
      // se conserva la primera ocurrencia que sí trae componentes.
      if (!blocks[code] || (!blocks[code].hasComponents && hasComponents)) {
        blocks[code] = { description, unit, tipo, materials, personal, equipos, hasComponents };
      }
    }
    i = j;
  }

  return blocks;
}

try {
  const workbook = XLSX.read(workerData.buffer, {
    type: 'buffer',
    cellFormula: false,
    bookVBA: false,
    bookFiles: false,
  });

  const itemsSheet = findSheet(workbook, ITEMS_SHEET_CANDIDATES);
  const apuSheet = findSheet(workbook, APU_SHEET_CANDIDATES);
  if (!itemsSheet) throw new Error('No se encontró la hoja de ítems de presupuesto (se esperaba "Items de Presupuesto").');
  if (!apuSheet) throw new Error('No se encontró la hoja de APU (se esperaba "Unitarios").');

  const budgetItems = parseBudgetItemsSheet(itemsSheet);
  const neededCodes = new Set(budgetItems.map((it) => it.apuCode));
  const apuBlocks = parseApuBlocksSheet(apuSheet, neededCodes);

  parentPort.postMessage({ ok: true, budgetItems, apuBlocks });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
