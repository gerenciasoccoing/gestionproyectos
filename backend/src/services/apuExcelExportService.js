const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { buildApuExportData } = require('./apuExportService');

// Réplica del formato oficial "modelo_apu.xlsx": mismo layout (logo, título, bloque
// ítem/código/unidad, 4 secciones I-IV, costo directo, costos indirectos/AIU, precio unitario
// total y firmas), pero generada por completo en cada exportación (sin fórmulas a libros
// externos como las de la plantilla original) y con la cantidad de filas de cada sección
// ajustada al número real de componentes del APU (la plantilla trae un número fijo de filas por
// sección, insuficiente para APU con muchos materiales).
//
// Los subtotales, el total de costo directo, los indirectos y el precio unitario total quedan
// como FÓRMULAS reales de Excel (no valores fijos), igual que en la plantilla, para que el
// archivo se recalcule solo si el cliente edita una cantidad o un porcentaje de AIU.

const THIN = { style: 'thin' };
const BOX_BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const GRAY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD8D8D8' } };
const CURRENCY_FMT = '_-"$"* #,##0.00_-;-"$"* #,##0.00_-;_-"$"* "-"??_-;_-@';
const QTY_FMT = '#,##0.0000';
const PERCENT_FMT = '0.00%';

function colLetterToIndex(letter) {
  return letter.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

function parseRange(range) {
  const [start, end] = range.split(':');
  const sMatch = start.match(/([A-Z]+)(\d+)/);
  const eMatch = (end || start).match(/([A-Z]+)(\d+)/);
  return {
    c1: colLetterToIndex(sMatch[1]), r1: Number(sMatch[2]),
    c2: colLetterToIndex(eMatch[1]), r2: Number(eMatch[2]),
  };
}

function eachCellInRange(ws, range, fn) {
  const { c1, r1, c2, r2 } = parseRange(range);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) fn(ws.getCell(r, c));
  }
}

function applyStyle(cell, { bold = false, size = 10, align = 'center', valign = 'middle', wrap = false, fill = null, border = BOX_BORDER, numFmt = null, color = null } = {}) {
  cell.font = { name: 'Calibri', size, bold, color: color ? { argb: color } : undefined };
  cell.alignment = { horizontal: align, vertical: valign, wrapText: wrap };
  if (fill) cell.fill = fill;
  if (border) cell.border = border;
  if (numFmt) cell.numFmt = numFmt;
}

// Combina, estiliza (todas las celdas del rango, para que el borde se vea completo alrededor de
// la celda fusionada) y opcionalmente asigna un valor a la celda superior-izquierda.
function mergeAndStyle(ws, range, value, style) {
  ws.mergeCells(range);
  eachCellInRange(ws, range, (cell) => applyStyle(cell, style));
  if (value !== undefined) {
    const topLeft = range.split(':')[0];
    ws.getCell(topLeft).value = value;
  }
}

function setCell(ws, address, value, style) {
  const cell = ws.getCell(address);
  applyStyle(cell, style);
  if (value !== undefined) cell.value = value;
  return cell;
}

// Una fila "placeholder" cuando una sección no tiene componentes, para que la fórmula de
// SUBTOTAL (que suma un rango de filas) siga siendo válida.
const EMPTY_ROW_LABEL = '(sin ítems)';

function embedLogo(workbook, company) {
  if (!company || !company.logoPath || !fs.existsSync(company.logoPath)) return null;
  const ext = path.extname(company.logoPath).slice(1).toLowerCase();
  const extension = ext === 'jpg' ? 'jpeg' : ext;
  if (!['png', 'jpeg', 'gif'].includes(extension)) return null;
  try {
    return workbook.addImage({ buffer: fs.readFileSync(company.logoPath), extension });
  } catch (e) {
    return null; // logo ilegible: se omite sin romper la generación
  }
}

// Escribe el análisis de un APU en `ws` a partir de la fila `startRow`. Devuelve la fila
// siguiente a la última usada (para poder encadenar varios APU en una misma hoja si se quisiera).
function writeApuSheet(ws, data, { itemLabel, elaboroNombre, revisoNombre, company, exportDate, logoImageId } = {}) {
  ws.columns = [
    { width: 3 }, { width: 11 }, { width: 22 }, { width: 10 }, { width: 11 },
    { width: 10 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 2 },
  ];

  let r = 2;

  // Logo / encabezado
  ws.getRow(r).height = 55;
  if (logoImageId !== null && logoImageId !== undefined) {
    ws.mergeCells(`B${r}:D${r}`);
    eachCellInRange(ws, `B${r}:D${r}`, (cell) => applyStyle(cell, { fill: null, border: BOX_BORDER }));
    ws.addImage(logoImageId, `B${r}:D${r}`);
  } else {
    mergeAndStyle(ws, `B${r}:D${r}`, company?.companyName || 'LOGO CLIENTE', { bold: true, fill: GRAY_FILL, wrap: true });
  }
  r += 1;

  mergeAndStyle(ws, `B${r}:I${r}`, company?.companyName || '', { bold: true, size: 12 });
  r += 1;

  mergeAndStyle(ws, `B${r}:I${r}`, 'ANALISIS UNITARIOS', { bold: true, fill: GRAY_FILL, size: 11 });
  r += 1;

  // Ítem / descripción / unidad (2 filas fusionadas)
  const itemRow1 = r;
  const itemRow2 = r + 1;
  setCell(ws, `B${itemRow1}`, 'ITEM', { bold: true, fill: GRAY_FILL });
  setCell(ws, `B${itemRow2}`, data.apu.code || '-', { bold: true, fill: GRAY_FILL });
  mergeAndStyle(ws, `C${itemRow1}:H${itemRow2}`, data.apu.name, { bold: true, fill: GRAY_FILL, wrap: true });
  setCell(ws, `I${itemRow1}`, 'UND', { bold: true, fill: GRAY_FILL });
  setCell(ws, `I${itemRow2}`, data.apu.unit, { bold: true, fill: GRAY_FILL });
  r += 3; // deja una fila en blanco tras el bloque

  if (itemLabel) {
    mergeAndStyle(ws, `B${r}:I${r}`, itemLabel, { align: 'left', size: 9, border: null, fill: null });
    r += 2;
  }

  // --- Sección genérica: título + encabezados + N filas de datos + subtotal ---
  // `rows` ya viene con al menos 1 fila (se agrega un placeholder si la sección viene vacía).
  const writeSection = (title, headers, rows, writeDataRow) => {
    setCell(ws, `B${r}`, title, { bold: true, align: 'left', border: { left: THIN }, fill: null });
    r += 1;

    const headerRow = r;
    headers.forEach(({ col, label, numFmt }) => setCell(ws, `${col}${headerRow}`, label, { bold: true, numFmt }));
    r += 1;

    const dataStart = r;
    const effectiveRows = rows.length ? rows : [{ __empty: true }];
    effectiveRows.forEach((row) => {
      if (row.__empty) {
        mergeAndStyle(ws, `B${r}:I${r}`, EMPTY_ROW_LABEL, { align: 'left', color: 'FF999999', border: BOX_BORDER });
      } else {
        writeDataRow(r, row);
      }
      r += 1;
    });
    const dataEnd = r - 1;

    return { dataStart, dataEnd };
  };

  // I. Herramientas y Equipo — el "REND." de la plantilla es el único multiplicador disponible
  // junto a V.UNIT.; para que I=G*H reproduzca fielmente quantity*yield*vUnit, se combinan
  // quantity y yield en un solo número antes de escribirlo en H.
  const herramientas = writeSection(
    'I.  HERRAMIENTAS Y EQUIPO',
    [
      { col: 'B', label: 'COD' }, { col: 'C', label: 'DESCRIPCION' }, { col: 'F', label: 'UND' },
      { col: 'G', label: 'V.UNIT.' }, { col: 'H', label: 'REND.' }, { col: 'I', label: 'V/ PARCIAL' },
    ],
    data.herramientas,
    (row, item) => {
      setCell(ws, `B${row}`, item.code, {});
      mergeAndStyle(ws, `C${row}:E${row}`, item.description, { align: 'left', wrap: true });
      setCell(ws, `F${row}`, item.unit, {});
      // Cuando no hay insumo propio (fila sintética de "otros costos directos", ver
      // apuExportService: vUnit/rend vienen null y el valor ya resuelto está en item.parcial), el
      // valor se escribe directo en V.UNIT. con REND.=1 para que I=G*H siga siendo una fórmula.
      setCell(ws, `G${row}`, item.vUnit != null ? item.vUnit : item.parcial, { numFmt: CURRENCY_FMT });
      setCell(ws, `H${row}`, item.vUnit != null ? Number(item.rend) : 1, { numFmt: QTY_FMT });
      setCell(ws, `I${row}`, { formula: `G${row}*H${row}` }, { numFmt: CURRENCY_FMT, bold: false });
    }
  );
  setCell(ws, `H${r}`, 'SUBTOTAL', { bold: true });
  const herrSubtotalRow = r;
  setCell(ws, `I${r}`, { formula: `ROUND(SUM(I${herramientas.dataStart}:I${herramientas.dataEnd}),2)` }, { bold: true, numFmt: CURRENCY_FMT });
  r += 2;

  // II. Materiales — el % de desperdicio ya viene incorporado en la cantidad de cada material
  // (r.cantDesp, propio de cada ítem: ver apuExportService), así que la fila de "DESPERDICIO"
  // agregada de la plantilla se deja en 0% para no duplicar el desperdicio (ya está sumado por
  // ítem) y se conserva solo por fidelidad estructural con el formato original.
  const materiales = writeSection(
    'II. MATERIALES',
    [
      { col: 'B', label: 'COD' }, { col: 'C', label: 'DESCRIPCION' }, { col: 'F', label: 'CANT' },
      { col: 'G', label: 'UNIDAD' }, { col: 'H', label: 'V/UNIT.' }, { col: 'I', label: 'V/ PARCIAL' },
    ],
    data.materiales,
    (row, item) => {
      setCell(ws, `B${row}`, item.code, {});
      mergeAndStyle(ws, `C${row}:E${row}`, item.description, { align: 'left', wrap: true });
      setCell(ws, `F${row}`, Number(item.cantDesp), { numFmt: QTY_FMT });
      setCell(ws, `G${row}`, item.unit, {});
      setCell(ws, `H${row}`, item.vUnit, { numFmt: CURRENCY_FMT });
      setCell(ws, `I${row}`, { formula: `H${row}*F${row}` }, { numFmt: CURRENCY_FMT });
    }
  );
  const despRow = r;
  mergeAndStyle(ws, `C${r}:E${r}`, 'DESPERDICIO (incluido por ítem)', { bold: true });
  setCell(ws, `F${r}`, 0, { numFmt: PERCENT_FMT });
  setCell(ws, `G${r}`, { formula: `SUM(I${materiales.dataStart}:I${materiales.dataEnd})` }, { numFmt: CURRENCY_FMT });
  setCell(ws, `I${r}`, { formula: `G${r}*F${r}` }, { numFmt: CURRENCY_FMT });
  r += 1;
  setCell(ws, `H${r}`, 'SUBTOTAL', { bold: true });
  const matSubtotalRow = r;
  setCell(ws, `I${r}`, { formula: `ROUND(SUM(I${materiales.dataStart}:I${despRow}),2)` }, { bold: true, numFmt: CURRENCY_FMT });
  r += 2;

  // III. Mano de Obra — JORNAL DIA ya viene calculado (ver apuExportService/laborBreakdown) como
  // valor base / (1 + %prestacional), y PREST. se escribe como multiplicador (1 + %prestacional/100),
  // igual convención que la plantilla, para que TOTAL+PREST = CANT.*JORNAL*PREST. sea una fórmula
  // real y (con cantidad=1) vuelva a dar el valor base original.
  const personal = writeSection(
    'III.MANO DE OBRA',
    [
      { col: 'B', label: 'COD' }, { col: 'C', label: 'DESCRIPCION' }, { col: 'D', label: 'CANT.' },
      { col: 'E', label: 'JORNAL DIA' }, { col: 'F', label: 'PREST.' }, { col: 'G', label: 'TOTAL+PREST' },
      { col: 'H', label: 'REND.(UND/P)' }, { col: 'I', label: 'V/ PARCIAL' },
    ],
    data.personal,
    (row, item) => {
      setCell(ws, `B${row}`, item.code, {});
      setCell(ws, `C${row}`, item.description, { align: 'left', wrap: true });
      setCell(ws, `D${row}`, Number(item.cant), { numFmt: '0.00' });
      setCell(ws, `E${row}`, item.jornal, { numFmt: CURRENCY_FMT });
      setCell(ws, `F${row}`, 1 + Number(item.prestPercent) / 100, { numFmt: '0.00' });
      setCell(ws, `G${row}`, { formula: `D${row}*E${row}*F${row}` }, { numFmt: CURRENCY_FMT });
      setCell(ws, `H${row}`, Number(item.rend), { numFmt: '0.00' });
      setCell(ws, `I${row}`, { formula: `G${row}/H${row}` }, { numFmt: CURRENCY_FMT });
    }
  );
  setCell(ws, `H${r}`, 'SUBTOTAL', { bold: true });
  const persSubtotalRow = r;
  setCell(ws, `I${r}`, { formula: `ROUND(SUM(I${personal.dataStart}:I${personal.dataEnd}),2)` }, { bold: true, numFmt: CURRENCY_FMT });
  r += 2;

  // IV. Transporte — el modo "% sobre materiales" no tiene columna propia en la plantilla; se
  // escribe el valor ya resuelto en V.UNIT. con un multiplicador de 1 para mantenerlo como fórmula.
  const transporte = writeSection(
    'IV.TRANSPORTE',
    [
      { col: 'B', label: 'COD' }, { col: 'C', label: 'DESCRIPCION' }, { col: 'D', label: 'DIST' },
      { col: 'G', label: 'KG' }, { col: 'H', label: 'V/UNIT.(m3/km)' }, { col: 'I', label: 'V/ PARCIAL' },
    ],
    data.transporte,
    (row, item) => {
      setCell(ws, `B${row}`, item.code, {});
      setCell(ws, `C${row}`, item.percent != null ? `${item.description} (${item.percent}% sobre materiales)` : item.description, { align: 'left', wrap: true });
      if (item.percent != null) {
        setCell(ws, `D${row}`, '-', {});
        setCell(ws, `G${row}`, item.parcial, { numFmt: CURRENCY_FMT });
        setCell(ws, `H${row}`, 1, { numFmt: '0.00' });
      } else {
        setCell(ws, `D${row}`, Number(item.distancia), { numFmt: QTY_FMT });
        setCell(ws, `G${row}`, Number(item.peso), { numFmt: QTY_FMT });
        setCell(ws, `H${row}`, item.vUnit, { numFmt: CURRENCY_FMT });
      }
      setCell(ws, `I${row}`, { formula: `D${row}*G${row}*H${row}` }, { numFmt: CURRENCY_FMT });
    }
  );
  setCell(ws, `H${r}`, 'SUBTOTAL', { bold: true });
  const transSubtotalRow = r;
  setCell(ws, `I${r}`, { formula: `ROUND(SUM(I${transporte.dataStart}:I${transporte.dataEnd}),2)` }, { bold: true, numFmt: CURRENCY_FMT });
  r += 2;

  // Total costo directo
  mergeAndStyle(ws, `E${r}:H${r}`, 'TOTAL COSTO DIRECTO', { bold: true, align: 'right' });
  const totalDirectoRow = r;
  setCell(ws, `I${r}`, { formula: `I${herrSubtotalRow}+I${matSubtotalRow}+I${persSubtotalRow}+I${transSubtotalRow}` }, { bold: true, numFmt: CURRENCY_FMT });
  r += 2;

  // V. Costos indirectos (AIU) — H48/H49/H50 quedan como celdas editables con el AIU configurado
  // en el proyecto/cotización (no fijo), tal como pide la plantilla.
  setCell(ws, `B${r}`, 'V- COSTOS INDIRECTOS', { bold: true, align: 'left', border: { left: THIN }, fill: null });
  r += 2;

  const indirectRow = (label, percent) => {
    const row = r;
    mergeAndStyle(ws, `B${row}:G${row}`, label, { bold: true, align: 'center' });
    setCell(ws, `H${row}`, Number(percent) / 100, { numFmt: PERCENT_FMT });
    setCell(ws, `I${row}`, { formula: `I${totalDirectoRow}*H${row}` }, { numFmt: CURRENCY_FMT, bold: true });
    r += 1;
    return row;
  };
  const adminRow = indirectRow('ADMINISTRACION', data.aiu.adminPercent);
  const imprevRow = indirectRow('IMPREVISTO', data.aiu.imprevistosPercent);
  const utilRow = indirectRow('UTILIDAD', data.aiu.utilidadPercent);

  const aiuRow = r;
  mergeAndStyle(ws, `B${r}:G${r}`, 'A.I.U', { bold: true, align: 'center' });
  setCell(ws, `H${r}`, { formula: `SUM(H${adminRow}:H${utilRow})` }, { bold: true, numFmt: PERCENT_FMT });
  setCell(ws, `I${r}`, { formula: `SUM(I${adminRow}:I${utilRow})` }, { bold: true, numFmt: CURRENCY_FMT });
  r += 2;

  mergeAndStyle(ws, `B${r}:H${r}`, 'PRECIO UNITARIO TOTAL', { bold: true, align: 'right' });
  setCell(ws, `I${r}`, { formula: `ROUND(I${aiuRow}+I${totalDirectoRow},0)` }, { bold: true, numFmt: '"$"\\ #,##0.00', color: 'FF0000FF', align: 'right' });
  r += 3;

  // Firmas — los nombres se digitan justo antes de exportar y no se guardan como datos del
  // sistema; la fecha es la de exportación (o la que indique el usuario).
  mergeAndStyle(ws, `C${r}:E${r}`, 'Elaboró y validó', { bold: true, size: 9 });
  mergeAndStyle(ws, `F${r}:H${r}`, 'Revisó y Aprobó', { bold: true, size: 9 });
  r += 1;
  mergeAndStyle(ws, `C${r}:E${r}`, elaboroNombre || '', { size: 9, border: BOX_BORDER });
  mergeAndStyle(ws, `F${r}:H${r}`, revisoNombre || '', { size: 9, border: BOX_BORDER });
  r += 1;
  const dateLabel = `Fecha: ${exportDate || new Date().toISOString().slice(0, 10)}`;
  mergeAndStyle(ws, `C${r}:E${r}`, dateLabel, { size: 9, border: BOX_BORDER });
  mergeAndStyle(ws, `F${r}:H${r}`, dateLabel, { size: 9, border: BOX_BORDER });
  r += 1;

  return r;
}

function sanitizeSheetName(name, used) {
  let base = String(name || 'APU').replace(/[[\]*/\\?:]/g, '').slice(0, 28) || 'APU';
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 26)}_${i}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

// Genera el .xlsx de un APU individual siguiendo el formato de "modelo_apu.xlsx".
async function generateApuExcelBuffer({ apu, aiu, elaboroNombre, revisoNombre, itemLabel, company, exportDate }) {
  const data = buildApuExportData(apu, aiu);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('APU');
  const logoImageId = embedLogo(workbook, company);
  writeApuSheet(ws, data, { itemLabel, elaboroNombre, revisoNombre, company, exportDate, logoImageId });
  return workbook.xlsx.writeBuffer();
}

// Presupuesto: hoja "Resumen" + una hoja por cada APU referenciado, cada una en el formato de
// "modelo_apu.xlsx". Nombres de hoja limitados a 31 caracteres y sin caracteres especiales: se
// sanea el código del APU y se numera si hay choques.
async function generateBudgetWithApuAnnexExcelBuffer({ project, items, apuDataById, elaboroNombre, revisoNombre, company, exportDate }) {
  const workbook = new ExcelJS.Workbook();
  const logoImageId = embedLogo(workbook, company);

  const summary = workbook.addWorksheet('Resumen');
  summary.columns = [{ width: 14 }, { width: 40 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 16 }];
  mergeAndStyle(summary, 'A1:F1', 'PRESUPUESTO', { bold: true, size: 14, border: null, fill: null });
  mergeAndStyle(summary, 'A2:F2', project?.name || '', { size: 11, border: null, fill: null });
  const headerRow = 4;
  ['Código', 'Descripción', 'Unidad', 'Cantidad', 'Vr. Unitario', 'Vr. Total'].forEach((label, i) => {
    setCell(summary, `${String.fromCharCode(65 + i)}${headerRow}`, label, { bold: true, align: i <= 1 ? 'left' : 'center' });
  });
  let row = headerRow + 1;
  let total = 0;
  items.forEach((it) => {
    const apuCode = it.apuId ? (apuDataById.get(it.apuId)?.apu.code || '-') : '-';
    setCell(summary, `A${row}`, apuCode, { align: 'left', border: BOX_BORDER });
    setCell(summary, `B${row}`, it.description, { align: 'left', border: BOX_BORDER });
    setCell(summary, `C${row}`, it.unit, { border: BOX_BORDER });
    setCell(summary, `D${row}`, Number(it.quantity), { numFmt: QTY_FMT, border: BOX_BORDER });
    setCell(summary, `E${row}`, Number(it.unitCost), { numFmt: CURRENCY_FMT, border: BOX_BORDER });
    setCell(summary, `F${row}`, Number(it.totalCost), { numFmt: CURRENCY_FMT, border: BOX_BORDER });
    total += Number(it.totalCost);
    row += 1;
  });
  row += 1;
  mergeAndStyle(summary, `A${row}:E${row}`, 'TOTAL PRESUPUESTO', { bold: true, align: 'right', border: null, fill: null });
  setCell(summary, `F${row}`, total, { bold: true, numFmt: CURRENCY_FMT, border: null });

  const used = new Set(['Resumen']);
  items.filter((it) => it.apuId && apuDataById.has(it.apuId)).forEach((item) => {
    const data = apuDataById.get(item.apuId);
    const ws = workbook.addWorksheet(sanitizeSheetName(data.apu.code || data.apu.name, used));
    writeApuSheet(ws, data, { itemLabel: item.description, elaboroNombre, revisoNombre, company, exportDate, logoImageId });
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = { generateApuExcelBuffer, generateBudgetWithApuAnnexExcelBuffer };
