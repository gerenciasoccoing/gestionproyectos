const PDFDocument = require('pdfkit');

function money(n) {
  return `$ ${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
}

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor('#1f2937').font('Helvetica-Bold').text(text);
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor('#000000').font('Helvetica');
}

// Genera el informe consolidado de proyecto (EVM, hitos/actas, riesgos, avance por ítem, compras).
function generateProjectReportPdf({ project, evm, milestones, minutes, risks, progressItems, purchases }) {
  const doc = new PDFDocument({ margin: 50 });

  doc.fontSize(18).font('Helvetica-Bold').text('Informe de Proyecto', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica').text(project.name, { align: 'center' });
  doc.fontSize(9).fillColor('#555').text(`Cliente: ${project.client || '-'}  |  Estado: ${project.status}`, { align: 'center' });
  doc.fillColor('#000');

  sectionTitle(doc, 'Indicadores de Valor Ganado (EVM)');
  doc.text(`PV (Valor Planeado): ${money(evm.PV)}`);
  doc.text(`EV (Valor Ganado): ${money(evm.EV)}`);
  doc.text(`AC (Costo Real): ${money(evm.AC)}`);
  doc.text(`CV (Variación de Costo): ${money(evm.CV)}`);
  doc.text(`SV (Variación de Cronograma): ${money(evm.SV)}`);
  doc.text(`CPI (Índice de Desempeño de Costo): ${evm.CPI !== null ? evm.CPI.toFixed(2) : 'N/A'}`);
  doc.text(`SPI (Índice de Desempeño de Cronograma): ${evm.SPI !== null ? evm.SPI.toFixed(2) : 'N/A'}`);

  sectionTitle(doc, 'Hitos');
  if (!milestones.length) doc.text('Sin hitos registrados.');
  milestones.forEach((m) => {
    doc.text(`- ${m.name} | Planeado: ${m.plannedDate} | Real: ${m.actualDate || '-'} | Estado: ${m.status}`);
  });

  sectionTitle(doc, 'Actas');
  if (!minutes.length) doc.text('Sin actas registradas.');
  minutes.forEach((m) => {
    doc.text(`- ${m.type} | Fecha: ${m.date}`);
  });

  sectionTitle(doc, 'Riesgos');
  if (!risks.length) doc.text('Sin riesgos registrados.');
  risks.forEach((r) => {
    doc.text(`- ${r.description} | Impacto: ${r.impact} | Probabilidad: ${r.probability} | Estado: ${r.status}`);
  });

  sectionTitle(doc, 'Avance por ítem de presupuesto');
  if (!progressItems.length) doc.text('Sin ítems de presupuesto.');
  progressItems.forEach((i) => {
    doc.text(`- ${i.description}: ${i.accumulatedQty}/${i.quantity} ${i.unit} (${i.percent}%) | Valor ejecutado: ${money(i.executedValue)}`);
  });

  sectionTitle(doc, 'Reporte de compras');
  if (!purchases.rows.length) doc.text('Sin compras registradas.');
  purchases.rows.forEach((p) => {
    doc.text(`- ${p.material} | Cant: ${p.quantityReceived} ${p.unit} | Costo: ${money(p.totalCost)} | Proveedor: ${p.supplier} | Orden: ${p.orderStatus}`);
  });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').text(`Total compras: ${money(purchases.totals.cost)}`);

  doc.end();
  return doc;
}

// Genera la cotización en PDF como propuesta ejecutiva: logo, datos del cliente/proyecto,
// tabla resumen de ítems, subtotal, AIU discriminado (Administración/Imprevistos/Utilidad) y total.
function generateQuotationPdf({ quotation, items, company, aiu }) {
  const doc = new PDFDocument({ margin: 50 });

  // Encabezado con branding
  if (company && company.logoPath && require('fs').existsSync(company.logoPath)) {
    try {
      doc.image(company.logoPath, 50, 45, { width: 90 });
    } catch (e) { /* si el logo no puede leerse, se omite sin romper la generación */ }
  }
  doc.fontSize(16).font('Helvetica-Bold').text(company ? company.companyName : 'Empresa', 160, 50);
  doc.fontSize(9).font('Helvetica').fillColor('#555')
    .text(company?.nit ? `NIT: ${company.nit}` : '', 160, 70)
    .text(company?.address || '', 160, 84)
    .text(company?.phone || '', 160, 98);
  doc.fillColor('#000');

  doc.moveDown(3);
  doc.fontSize(18).font('Helvetica-Bold').text('PROPUESTA / COTIZACIÓN', { align: 'center' });
  doc.moveDown(0.5);

  doc.fontSize(10).font('Helvetica');
  doc.text(`Cliente: ${quotation.clientName}`);
  doc.text(`Proyecto propuesto: ${quotation.projectNameProposed}`);
  doc.text(`Fecha: ${quotation.date}`);
  doc.text(`Validez de la oferta: ${quotation.validityDays} días`);

  sectionTitle(doc, 'Resumen de ítems');

  const tableTop = doc.y + 5;
  const colX = { desc: 50, unit: 260, qty: 310, unitCost: 370, total: 460 };
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Descripción', colX.desc, tableTop);
  doc.text('Unidad', colX.unit, tableTop);
  doc.text('Cant.', colX.qty, tableTop);
  doc.text('Vr. Unit.', colX.unitCost, tableTop);
  doc.text('Vr. Total', colX.total, tableTop);
  doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke();

  let y = tableTop + 20;
  doc.font('Helvetica').fontSize(9);
  let subtotalDirect = 0;
  let totalAiu = 0;
  items.forEach((item) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.text(item.description, colX.desc, y, { width: 200 });
    doc.text(item.unit, colX.unit, y);
    doc.text(String(item.quantity), colX.qty, y);
    doc.text(money(item.unitCost), colX.unitCost, y);
    doc.text(money(item.totalCost), colX.total, y);
    subtotalDirect += Number(item.directSubtotal ?? item.totalCost);
    totalAiu += Number(item.aiuAmount ?? 0);
    y += 18;
  });

  const total = subtotalDirect + totalAiu;
  y += 10;
  doc.moveTo(350, y).lineTo(545, y).stroke();
  y += 8;
  doc.font('Helvetica').text(`Subtotal (costo directo): ${money(subtotalDirect)}`, 300, y, { align: 'right', width: 245 });
  y += 16;
  if (aiu) {
    doc.text(`Administración (${Number(aiu.adminPercent)}%): ${money(subtotalDirect * Number(aiu.adminPercent) / 100)}`, 300, y, { align: 'right', width: 245 });
    y += 16;
    doc.text(`Imprevistos (${Number(aiu.imprevistosPercent)}%): ${money(subtotalDirect * Number(aiu.imprevistosPercent) / 100)}`, 300, y, { align: 'right', width: 245 });
    y += 16;
    doc.text(`Utilidad (${Number(aiu.utilidadPercent)}%): ${money(subtotalDirect * Number(aiu.utilidadPercent) / 100)}`, 300, y, { align: 'right', width: 245 });
  } else {
    doc.text(`AIU: ${money(totalAiu)}`, 300, y, { align: 'right', width: 245 });
  }
  y += 16;
  doc.font('Helvetica-Bold').fontSize(11).text(`TOTAL: ${money(total)}`, 300, y, { align: 'right', width: 245 });

  doc.moveDown(3);
  sectionTitle(doc, 'Condiciones');
  doc.font('Helvetica').fontSize(9).text(quotation.paymentTerms || 'Forma de pago a definir.');

  doc.end();
  return doc;
}

// Dibuja el desglose completo de un APU (formato "modelo_apu.xlsx": Herramientas y Equipo,
// Materiales, Mano de Obra, Transporte, Costos Indirectos/AIU, Precio Unitario Total, firmas)
// en la página actual del documento, a partir de la posición y indicada. Devuelve la posición y
// final. Reutilizable tanto para exportar un APU individual como para el anexo de un presupuesto
// (una página por APU).
function drawApuAnalysis(doc, data, { itemLabel, elaboroNombre, revisoNombre, company } = {}) {
  const left = 50;
  const right = 545;
  let y = doc.y;

  const ensureSpace = (needed) => {
    if (y + needed > 760) { doc.addPage(); y = 50; }
  };

  if (company && company.logoPath && require('fs').existsSync(company.logoPath)) {
    try { doc.image(company.logoPath, left, y, { width: 70 }); } catch (e) { /* logo ilegible: se omite */ }
  }
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text('ANÁLISIS UNITARIOS', left + 80, y, { width: right - left - 80, align: 'center' });
  y += 24;
  if (itemLabel) {
    doc.font('Helvetica').fontSize(9).text(itemLabel, left + 80, y, { width: right - left - 80, align: 'center' });
    y += 14;
  }
  y = Math.max(y, doc.y) + 6;

  doc.font('Helvetica-Bold').fontSize(10).text(`Ítem: ${data.apu.name}`, left, y);
  y += 14;
  doc.font('Helvetica').fontSize(9).text(`Código: ${data.apu.code || '-'}    Unidad: ${data.apu.unit}`, left, y);
  y += 20;

  const drawSectionTable = (title, columns, rows, subtotal) => {
    ensureSpace(40);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937').text(title, left, y);
    y += 14;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
    columns.forEach((c) => doc.text(c.label, left + c.x, y, { width: c.width }));
    y += 10;
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 4;
    doc.font('Helvetica').fontSize(7.5);
    if (!rows.length) {
      doc.fillColor('#999').text('(sin ítems)', left, y);
      doc.fillColor('#000');
      y += 12;
    }
    for (const row of rows) {
      // Alto de fila dinámico: una descripción larga puede envolver a más de una línea; con un
      // alto fijo, la siguiente fila quedaría escrita encima de la anterior.
      const cellTexts = columns.map((c) => String(c.get(row)));
      const rowHeight = Math.max(10, ...columns.map((c, i) => doc.heightOfString(cellTexts[i], { width: c.width }))) + 3;
      ensureSpace(rowHeight);
      columns.forEach((c, i) => doc.text(cellTexts[i], left + c.x, y, { width: c.width }));
      y += rowHeight;
    }
    y += 2;
    doc.font('Helvetica-Bold').fontSize(8.5).text(`SUBTOTAL: ${money(subtotal)}`, left, y, { width: right - left, align: 'right' });
    y += 18;
  };

  drawSectionTable('I. HERRAMIENTAS Y EQUIPO',
    [
      { label: 'Código', x: 0, width: 55, get: (r) => r.code },
      { label: 'Descripción', x: 55, width: 230, get: (r) => r.description },
      { label: 'Unidad', x: 290, width: 40, get: (r) => r.unit },
      { label: 'V. Unit.', x: 335, width: 70, get: (r) => (r.vUnit != null ? money(r.vUnit) : '-') },
      { label: 'Rend.', x: 410, width: 40, get: (r) => (r.rend != null ? r.rend : '-') },
      { label: 'V. Parcial', x: 455, width: 90, get: (r) => money(r.parcial) },
    ], data.herramientas, data.herramientasSubtotal);

  drawSectionTable('II. MATERIALES',
    [
      { label: 'Código', x: 0, width: 50, get: (r) => r.code },
      { label: 'Descripción', x: 50, width: 175, get: (r) => r.description },
      { label: 'Cant.', x: 225, width: 40, get: (r) => Number(r.cantidad).toFixed(4) },
      { label: '% Desp.', x: 265, width: 40, get: (r) => `${r.wastePercent}%` },
      { label: 'Cant+Desp', x: 305, width: 50, get: (r) => Number(r.cantDesp).toFixed(4) },
      { label: 'Unidad', x: 355, width: 35, get: (r) => r.unit },
      { label: 'V. Unit.', x: 390, width: 70, get: (r) => money(r.vUnit) },
      { label: 'V. Parcial', x: 460, width: 85, get: (r) => money(r.parcial) },
    ], data.materiales, data.materialesSubtotal);

  drawSectionTable('III. MANO DE OBRA',
    [
      { label: 'Código', x: 0, width: 50, get: (r) => r.code },
      { label: 'Descripción', x: 50, width: 155, get: (r) => r.description },
      { label: 'Cant.', x: 205, width: 35, get: (r) => r.cant },
      { label: 'Jornal/Día', x: 240, width: 65, get: (r) => money(r.jornal) },
      { label: 'Prest.', x: 305, width: 40, get: (r) => `${r.prestPercent}%` },
      { label: 'Total+Prest', x: 345, width: 75, get: (r) => money(r.totalPrest) },
      { label: 'Rend.', x: 420, width: 35, get: (r) => r.rend },
      { label: 'V. Parcial', x: 455, width: 90, get: (r) => money(r.parcial) },
    ], data.personal, data.personalSubtotal);

  drawSectionTable('IV. TRANSPORTE',
    [
      { label: 'Código', x: 0, width: 50, get: (r) => r.code },
      { label: 'Descripción', x: 50, width: 180, get: (r) => r.description },
      { label: 'Dist./%', x: 230, width: 55, get: (r) => (r.percent != null ? `${r.percent}%` : r.distancia) },
      { label: 'Peso (kg)', x: 285, width: 55, get: (r) => (r.peso != null ? r.peso : '-') },
      { label: 'V. Unit.', x: 340, width: 65, get: (r) => (r.vUnit != null ? money(r.vUnit) : '-') },
      { label: 'V. Parcial', x: 460, width: 85, get: (r) => money(r.parcial) },
    ], data.transporte, data.transporteSubtotal);

  // Del total de costo directo al precio unitario total se revisa el espacio UNA sola vez para
  // todo el bloque junto: si se revisara por partes, una fila cualquiera podía quedar "huérfana"
  // sola al final de una página con el resto del bloque en la siguiente.
  ensureSpace(150);
  doc.font('Helvetica-Bold').fontSize(10).text(`TOTAL COSTO DIRECTO: ${money(data.directCost)}`, left, y, { width: right - left, align: 'right' });
  y += 22;

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937').text('V. COSTOS INDIRECTOS', left, y);
  y += 16;
  doc.font('Helvetica').fontSize(9).fillColor('#000');
  const indirectRow = (label, percent, amount) => {
    doc.text(`${label} (${percent}%)`, left, y, { width: 300 });
    doc.text(money(amount), 400, y, { width: 145, align: 'right' });
    y += 14;
  };
  indirectRow('Administración', data.aiu.adminPercent, data.aiu.adminAmount);
  indirectRow('Imprevistos', data.aiu.imprevistosPercent, data.aiu.imprevistosAmount);
  indirectRow('Utilidad', data.aiu.utilidadPercent, data.aiu.utilidadAmount);
  doc.font('Helvetica-Bold');
  indirectRow('A.I.U.', data.aiu.aiuPercent, data.aiu.aiuAmount);
  y += 4;

  doc.font('Helvetica-Bold').fontSize(12).text(`PRECIO UNITARIO TOTAL: ${money(data.totalWithAiu)}`, left, y, { width: right - left, align: 'right' });
  y += 30;

  ensureSpace(70);
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Elaboró y validó', left, y, { width: 220 });
  doc.text('Revisó y Aprobó', left + 270, y, { width: 220 });
  y += 30;
  doc.font('Helvetica').fontSize(9);
  doc.text(elaboroNombre || '_______________________', left, y, { width: 220 });
  doc.text(revisoNombre || '_______________________', left + 270, y, { width: 220 });
  y += 16;
  doc.fontSize(8).fillColor('#555');
  doc.text('Fecha: ______________', left, y, { width: 220 });
  doc.text('Fecha: ______________', left + 270, y, { width: 220 });
  doc.fillColor('#000');
  y += 20;

  doc.y = y;
  return y;
}

// Exporta un único APU al formato del modelo (ver drawApuAnalysis). aiu y las firmas son
// parámetros del momento de exportar: no se guardan en el APU ni en ningún proyecto/cotización.
function generateApuPdf({ apu, aiu, elaboroNombre, revisoNombre, company, itemLabel }) {
  const { buildApuExportData } = require('./apuExportService');
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
  const data = buildApuExportData(apu, aiu);
  drawApuAnalysis(doc, data, { itemLabel, elaboroNombre, revisoNombre, company });
  doc.end();
  return doc;
}

// Presupuesto: resumen de ítems + un anexo con la ficha completa de cada APU referenciado (una
// página por APU), con el AIU del presupuesto y las mismas firmas digitadas repetidas en cada
// página de APU.
function generateBudgetWithApuAnnexPdf({ project, budget, items, apuDataById, elaboroNombre, revisoNombre, company }) {
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

  if (company && company.logoPath && require('fs').existsSync(company.logoPath)) {
    try { doc.image(company.logoPath, 50, 45, { width: 90 }); } catch (e) { /* logo ilegible: se omite */ }
  }
  doc.font('Helvetica-Bold').fontSize(16).text(company ? company.companyName : 'Empresa', 160, 50);
  doc.moveDown(3);
  doc.fontSize(18).font('Helvetica-Bold').text('PRESUPUESTO', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica').text(project?.name || '', { align: 'center' });
  doc.moveDown(1);

  sectionTitle(doc, 'Resumen de ítems');
  const tableTop = doc.y + 5;
  const colX = { desc: 50, unit: 260, qty: 305, unitCost: 365, total: 460 };
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Descripción', colX.desc, tableTop);
  doc.text('Unidad', colX.unit, tableTop);
  doc.text('Cant.', colX.qty, tableTop);
  doc.text('Vr. Unit.', colX.unitCost, tableTop);
  doc.text('Vr. Total', colX.total, tableTop);
  doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke();

  let y = tableTop + 20;
  doc.font('Helvetica').fontSize(9);
  let total = 0;
  items.forEach((item) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.text(item.description, colX.desc, y, { width: 200 });
    doc.text(item.unit, colX.unit, y);
    doc.text(String(item.quantity), colX.qty, y);
    doc.text(money(item.unitCost), colX.unitCost, y);
    doc.text(money(item.totalCost), colX.total, y);
    total += Number(item.totalCost);
    y += 18;
  });
  y += 8;
  doc.moveTo(350, y).lineTo(545, y).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(11).text(`TOTAL PRESUPUESTO: ${money(total)}`, 300, y, { align: 'right', width: 245 });

  const withApu = items.filter((it) => it.apuId && apuDataById.has(it.apuId));
  if (withApu.length) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).text('ANEXO: ANÁLISIS DE PRECIOS UNITARIOS', { align: 'center' });
    doc.moveDown(1);
    withApu.forEach((item, idx) => {
      if (idx > 0) doc.addPage();
      const data = apuDataById.get(item.apuId);
      drawApuAnalysis(doc, data, { itemLabel: item.description, elaboroNombre, revisoNombre, company });
    });
  }

  doc.end();
  return doc;
}

module.exports = {
  generateProjectReportPdf, generateQuotationPdf, generateApuPdf, generateBudgetWithApuAnnexPdf, money,
};
