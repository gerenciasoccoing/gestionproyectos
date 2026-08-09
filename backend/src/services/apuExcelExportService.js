const XLSX = require('xlsx');
const { buildApuExportData } = require('./apuExportService');

function money(n) {
  return Number(n || 0);
}

// Filas (array de arrays) de un APU en el mismo orden de secciones que modelo_apu.xlsx. Sin logo
// (decisión del usuario para la variante Excel): solo texto/valores, editable por el usuario.
function apuRows(data, { itemLabel, elaboroNombre, revisoNombre } = {}) {
  const rows = [];
  rows.push(['ANALISIS UNITARIOS']);
  if (itemLabel) rows.push([itemLabel]);
  rows.push([`Ítem: ${data.apu.name}`]);
  rows.push([`Código: ${data.apu.code || '-'}`, `Unidad: ${data.apu.unit}`]);
  rows.push([]);

  rows.push(['I. HERRAMIENTAS Y EQUIPO']);
  rows.push(['Código', 'Descripción', 'Unidad', 'V.Unit.', 'Rend.', 'V.Parcial']);
  data.herramientas.forEach((r) => rows.push([r.code, r.description, r.unit, r.vUnit != null ? money(r.vUnit) : '-', r.rend != null ? r.rend : '-', money(r.parcial)]));
  rows.push(['', '', '', '', 'SUBTOTAL', money(data.herramientasSubtotal)]);
  rows.push([]);

  rows.push(['II. MATERIALES']);
  rows.push(['Código', 'Descripción', 'Cantidad', '% Desperdicio', 'Cant+Desp', 'Unidad', 'V.Unit.', 'V.Parcial']);
  data.materiales.forEach((r) => rows.push([r.code, r.description, r.cantidad, `${r.wastePercent}%`, r.cantDesp, r.unit, money(r.vUnit), money(r.parcial)]));
  rows.push(['', '', '', '', '', '', 'SUBTOTAL', money(data.materialesSubtotal)]);
  rows.push([]);

  rows.push(['III. MANO DE OBRA']);
  rows.push(['Código', 'Descripción', 'Cant.', 'Jornal/Día', 'Prest.', 'Total+Prest', 'Rend.', 'V.Parcial']);
  data.personal.forEach((r) => rows.push([r.code, r.description, r.cant, money(r.jornal), `${r.prestPercent}%`, money(r.totalPrest), r.rend, money(r.parcial)]));
  rows.push(['', '', '', '', '', '', 'SUBTOTAL', money(data.personalSubtotal)]);
  rows.push([]);

  rows.push(['IV. TRANSPORTE']);
  rows.push(['Código', 'Descripción', 'Dist./%', 'Peso (kg)', 'V.Unit.', 'V.Parcial']);
  data.transporte.forEach((r) => rows.push([r.code, r.description, r.percent != null ? `${r.percent}%` : r.distancia, r.peso ?? '-', r.vUnit != null ? money(r.vUnit) : '-', money(r.parcial)]));
  if (!data.transporte.length) rows.push(['(sin ítems)']);
  rows.push(['', '', '', '', 'SUBTOTAL', money(data.transporteSubtotal)]);
  rows.push([]);

  rows.push(['', '', '', '', 'TOTAL COSTO DIRECTO', money(data.directCost)]);
  rows.push([]);

  rows.push(['V. COSTOS INDIRECTOS']);
  rows.push(['Administración', `${data.aiu.adminPercent}%`, money(data.aiu.adminAmount)]);
  rows.push(['Imprevistos', `${data.aiu.imprevistosPercent}%`, money(data.aiu.imprevistosAmount)]);
  rows.push(['Utilidad', `${data.aiu.utilidadPercent}%`, money(data.aiu.utilidadAmount)]);
  rows.push(['A.I.U.', `${data.aiu.aiuPercent}%`, money(data.aiu.aiuAmount)]);
  rows.push([]);
  rows.push(['', '', '', '', 'PRECIO UNITARIO TOTAL', money(data.totalWithAiu)]);
  rows.push([]);
  rows.push([]);
  rows.push(['Elaboró y validó', '', '', 'Revisó y Aprobó']);
  rows.push([elaboroNombre || '', '', '', revisoNombre || '']);
  rows.push(['Fecha:', '', '', 'Fecha:']);

  return rows;
}

// Genera el .xlsx de un APU individual (sin logo). aiu y firmas son parámetros del momento de
// exportar, igual que en la versión PDF.
function generateApuExcelBuffer({ apu, aiu, elaboroNombre, revisoNombre, itemLabel }) {
  const data = buildApuExportData(apu, aiu);
  const rows = apuRows(data, { itemLabel, elaboroNombre, revisoNombre });
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'APU');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// Presupuesto: hoja "Resumen" + una hoja por cada APU referenciado (mismo desglose que la
// versión individual). Nombres de hoja de Excel limitados a 31 caracteres y sin caracteres
// especiales: se sanea el código del APU y se numera si hay choques.
function sanitizeSheetName(name, used) {
  let base = String(name || 'APU').replace(/[[\]*/\\?:]/g, '').slice(0, 28) || 'APU';
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 26)}_${i}`;
    i++;
  }
  used.add(candidate);
  return candidate;
}

function generateBudgetWithApuAnnexExcelBuffer({ project, items, apuDataById, elaboroNombre, revisoNombre }) {
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ['PRESUPUESTO'],
    [project?.name || ''],
    [],
    ['Descripción', 'Unidad', 'Cantidad', 'Vr. Unitario', 'Vr. Total'],
  ];
  let total = 0;
  items.forEach((it) => {
    summaryRows.push([it.description, it.unit, Number(it.quantity), money(it.unitCost), money(it.totalCost)]);
    total += Number(it.totalCost);
  });
  summaryRows.push([]);
  summaryRows.push(['', '', '', 'TOTAL', money(total)]);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 45 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  const used = new Set(['Resumen']);
  items.filter((it) => it.apuId && apuDataById.has(it.apuId)).forEach((item) => {
    const data = apuDataById.get(item.apuId);
    const rows = apuRows(data, { itemLabel: item.description, elaboroNombre, revisoNombre });
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, sheet, sanitizeSheetName(data.apu.code || data.apu.name, used));
  });

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateApuExcelBuffer, generateBudgetWithApuAnnexExcelBuffer };
