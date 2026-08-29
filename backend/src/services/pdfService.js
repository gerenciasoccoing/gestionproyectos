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
function generateProjectReportPdf({ project, evm, milestones, minutes, risks, progressItems, purchases, company }) {
  const doc = new PDFDocument({ margin: 50 });

  // Membrete (logo + datos de la empresa principal o del consorcio/unión temporal asignado al
  // proyecto, ver letterheadService.js) — mismo patrón que cotizaciones/órdenes/contratos.
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
  const colX = { code: 50, desc: 105, unit: 275, qty: 313, unitCost: 365, total: 460 };
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('Código', colX.code, tableTop);
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
    const apuCode = item.apuId ? (apuDataById.get(item.apuId)?.apu.code || '-') : '-';
    doc.text(apuCode, colX.code, y, { width: 50 });
    doc.text(item.description, colX.desc, y, { width: 160 });
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

// Etiquetas bilingües del PDF de orden de compra: a diferencia de los demás PDF de la app (todos
// en español fijo), este respeta el idioma activo en la interfaz (lang: 'es'|'en'), enviado por el
// frontend según i18n.language en el momento de exportar.
const PO_LABELS = {
  es: {
    title: 'ORDEN DE COMPRA',
    orderNumber: 'No.',
    date: 'Fecha de emisión',
    supplierSection: 'Datos del proveedor',
    name: 'Razón social',
    nit: 'NIT',
    phone: 'Teléfono',
    email: 'Correo',
    address: 'Dirección',
    itemsSection: 'Ítems',
    code: 'Código',
    description: 'Descripción',
    unit: 'Unidad',
    ordered: 'Cant. Ord.',
    delivered: 'Cant. Ent.',
    unitValue: 'Vr. Unit.',
    total: 'Vr. Total',
    subtotal: 'Subtotal',
    tax: 'IVA',
    retention: 'Retención en la fuente',
    grandTotal: 'TOTAL GENERAL',
    status: 'Estado de la orden',
    statusOpen: 'Abierta',
    statusPartial: 'Parcial (en ejecución)',
    statusClosed: 'Cerrada',
    statusClosedShortage: 'Cerrada con faltantes',
    shortageReason: 'Motivo del faltante',
    elaborated: 'Elaboró',
    authorized: 'Autorizó',
    dateLabel: 'Fecha',
  },
  en: {
    title: 'PURCHASE ORDER',
    orderNumber: 'No.',
    date: 'Issue date',
    supplierSection: 'Supplier information',
    name: 'Company name',
    nit: 'Tax ID',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    itemsSection: 'Items',
    code: 'Code',
    description: 'Description',
    unit: 'Unit',
    ordered: 'Ord. Qty.',
    delivered: 'Deliv. Qty.',
    unitValue: 'Unit Value',
    total: 'Total Value',
    subtotal: 'Subtotal',
    tax: 'VAT',
    retention: 'Withholding tax',
    grandTotal: 'GRAND TOTAL',
    status: 'Order status',
    statusOpen: 'Open',
    statusPartial: 'Partial (in progress)',
    statusClosed: 'Closed',
    statusClosedShortage: 'Closed with shortages',
    shortageReason: 'Shortage reason',
    elaborated: 'Prepared by',
    authorized: 'Authorized by',
    dateLabel: 'Date',
  },
};

// Orden de compra: encabezado con branding + consecutivo, datos del proveedor (de Terceros si
// está vinculada, o solo el nombre libre si no), tabla de ítems con cantidad entregada vs.
// ordenada, totales, estado (con motivo del faltante si aplica) y firmas. Este documento se le
// entrega al proveedor: NO lleva el proyecto ni el cliente final al que está destinada la compra
// (información interna que el proveedor no debe conocer). items: [{ code, name, unit,
// quantityOrdered, delivered, unitPrice, totalValue }] (ver exportPdf en
// purchaseOrderController.js).
// Paleta de marca del PDF: mismo azul primario que usa el sidebar de la app (bg-blue-600/700),
// llevado a un tono un poco más oscuro para que el texto blanco tenga buen contraste sobre la
// franja de encabezado impresa.
const PO_COLORS = {
  brand: '#1e40af',
  brandLight: '#eff6ff',
  border: '#e2e8f0',
  dark: '#0f172a',
  muted: '#64748b',
  rowAlt: '#f8fafc',
  white: '#ffffff',
};

// Mismos colores que STATUS_COLORS del badge de estado en el frontend (PurchaseOrdersPage.jsx),
// llevados a versión clara-de-fondo/oscura-de-texto para imprimirse legible como badge en el PDF.
const PO_STATUS_BADGE = {
  abierta: { bg: '#fef3c7', text: '#92400e' },
  parcial: { bg: '#dbeafe', text: '#1e40af' },
  cerrada: { bg: '#dcfce7', text: '#166534' },
  cerrada_con_faltantes: { bg: '#fee2e2', text: '#991b1b' },
};

function poBrandHeading(doc, text, y) {
  doc.rect(50, y, 4, 14).fill(PO_COLORS.brand);
  doc.fillColor(PO_COLORS.dark).font('Helvetica-Bold').fontSize(12).text(text, 62, y - 1);
  doc.fillColor(PO_COLORS.dark).font('Helvetica').fontSize(9);
  return y + 22;
}

// Orden de compra: layout moderno con franja de marca en el encabezado (logo + datos de la
// empresa a la izquierda, título/consecutivo/badge de estado a la derecha), tarjeta de
// proveedor a todo el ancho, y tabla de ítems con encabezado de color, filas en cebra y altura DINÁMICA
// por fila (ver comentario en el loop de abajo: esto es lo que corrige el bug de filas
// sobrepuestas cuando una descripción larga envuelve a más de una línea). items: [{ code, name,
// unit, quantityOrdered, delivered, unitPrice, totalValue }] (ver exportPdf en
// purchaseOrderController.js).
function generatePurchaseOrderPdf({ order, items, company, lang = 'es', totals, preparedByName }) {
  const L = PO_LABELS[lang] || PO_LABELS.es;
  const C = PO_COLORS;
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

  // Franja de encabezado
  const HEADER_H = 110;
  doc.rect(0, 0, doc.page.width, HEADER_H).fill(C.brand);
  let textX = 50;
  let textW = 240;
  // Logo agrandado (antes 70x60/imagen 60x50).
  if (company && company.logoPath && require('fs').existsSync(company.logoPath)) {
    try {
      doc.roundedRect(50, 15, 90, 80, 4).fill(C.white);
      doc.image(company.logoPath, 55, 20, { fit: [80, 70], align: 'center', valign: 'center' });
      textX = 152;
      textW = 190;
    } catch (e) { /* logo ilegible: se omite */ }
  }
  // El nombre de la empresa es de longitud variable por tenant y puede envolver a más de una
  // línea (ver mismo problema, resuelto igual, en la tabla de ítems más abajo): las líneas de
  // NIT/dirección/teléfono se ubican DESPUÉS de medir cuánto ocupó realmente el nombre, en vez de
  // en offsets fijos, para no terminar escritas encima de un nombre largo.
  const companyNameText = company ? company.companyName : 'Empresa';
  doc.font('Helvetica-Bold').fontSize(16);
  const nameH = doc.heightOfString(companyNameText, { width: textW });
  doc.fillColor(C.white).text(companyNameText, textX, 30, { width: textW });
  let infoY = 30 + nameH + 3;
  doc.font('Helvetica').fontSize(8.5).fillColor('#dbeafe');
  [company?.nit ? `NIT: ${company.nit}` : '', company?.address || '', company?.phone || '']
    .filter(Boolean)
    .forEach((line) => { doc.text(line, textX, infoY, { width: textW }); infoY += 12; });

  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16).text(L.title, 300, 30, { width: 245, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#dbeafe')
    .text(`${L.orderNumber} ${order.orderNumber || '-'}`, 300, 54, { width: 245, align: 'right' })
    .text(`${L.date}: ${order.date}`, 300, 68, { width: 245, align: 'right' });

  const STATUS_LABEL = {
    abierta: L.statusOpen,
    parcial: L.statusPartial,
    cerrada: L.statusClosed,
    cerrada_con_faltantes: L.statusClosedShortage,
  };
  const badge = PO_STATUS_BADGE[order.status] || PO_STATUS_BADGE.abierta;
  const badgeLabel = STATUS_LABEL[order.status] || order.status;
  doc.font('Helvetica-Bold').fontSize(8);
  const badgeW = doc.widthOfString(badgeLabel) + 16;
  const badgeX = 545 - badgeW;
  doc.roundedRect(badgeX, 84, badgeW, 16, 8).fill(badge.bg);
  doc.fillColor(badge.text).text(badgeLabel, badgeX, 88, { width: badgeW, align: 'center' });

  // Tarjeta de proveedor, a todo el ancho. Ya no lleva una tarjeta de proyecto al lado: este PDF
  // se le entrega al proveedor, y el proyecto/cliente final al que está destinada la compra es
  // información interna que el proveedor no debe conocer.
  const boxY = HEADER_H + 20;
  const boxH = 108;
  const boxW = 495;
  doc.roundedRect(50, boxY, boxW, boxH, 6).fillAndStroke(C.brandLight, C.border);
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(10).text(L.supplierSection, 62, boxY + 12, { width: boxW - 24 });
  doc.fillColor(C.dark).font('Helvetica').fontSize(8.5);
  const supplierParty = order.supplierParty;
  let sy = boxY + 30;
  [
    `${L.name}: ${supplierParty?.name || order.supplier}`,
    `${L.nit}: ${supplierParty?.nit || '-'}`,
    `${L.phone}: ${supplierParty?.phone || '-'}`,
    `${L.email}: ${supplierParty?.email || '-'}`,
    `${L.address}: ${supplierParty?.address || '-'}`,
  ].forEach((line) => { doc.text(line, 62, sy, { width: boxW - 24 }); sy += 14; });

  doc.fillColor(C.dark).strokeColor('#000000');
  let itemsHeadingY = poBrandHeading(doc, L.itemsSection, boxY + boxH + 20);

  const colX = { code: 50, desc: 95, unit: 245, ordered: 292, delivered: 345, unitValue: 405, total: 475 };
  const colW = { code: 43, desc: 148, unit: 45, ordered: 51, delivered: 58, unitValue: 68, total: 70 };
  // Alto de fila FIJO (18pt) era el bug original: si item.name envolvía a más de una línea dentro
  // de sus 148pt de ancho, la fila siguiente arrancaba 18pt después de todos modos, quedando
  // escrita encima del texto que ya se había desbordado — de ahí las filas sobrepuestas e
  // ilegibles con descripciones largas. Acá el alto de cada fila se mide con heightOfString ANTES
  // de dibujarla (el máximo entre las columnas que pueden envolver texto), y el salto de página
  // también se decide antes de dibujar en base a ese alto real — así nunca se corta una fila a la
  // mitad entre dos páginas, sin importar cuántos ítems tenga la orden.
  const ITEMS_BOTTOM_LIMIT = 730; // margen inferior de la página (margin:50, alto carta 792)
  const ROW_PADDING = 10;
  const HEADER_ROW_H = 22;

  function drawItemsTableHeader(yPos) {
    doc.rect(50, yPos, 495, HEADER_ROW_H).fill(C.brand);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8);
    const ty = yPos + 7;
    doc.text(L.code, colX.code, ty, { width: colW.code });
    doc.text(L.description, colX.desc, ty, { width: colW.desc });
    doc.text(L.unit, colX.unit, ty, { width: colW.unit });
    doc.text(L.ordered, colX.ordered, ty, { width: colW.ordered });
    doc.text(L.delivered, colX.delivered, ty, { width: colW.delivered });
    doc.text(L.unitValue, colX.unitValue, ty, { width: colW.unitValue });
    doc.text(L.total, colX.total, ty, { width: colW.total });
    doc.fillColor(C.dark).font('Helvetica').fontSize(8);
    return yPos + HEADER_ROW_H + 2;
  }

  let y = drawItemsTableHeader(itemsHeadingY);
  items.forEach((item, idx) => {
    const codeText = item.code || '-';
    const rowHeight = ROW_PADDING + Math.max(
      10,
      doc.heightOfString(codeText, { width: colW.code }),
      doc.heightOfString(item.name, { width: colW.desc }),
      doc.heightOfString(item.unit, { width: colW.unit })
    );
    if (y + rowHeight > ITEMS_BOTTOM_LIMIT) {
      doc.addPage();
      y = drawItemsTableHeader(50);
    }
    if (idx % 2 === 1) doc.rect(50, y - 5, 495, rowHeight).fill(C.rowAlt);
    doc.fillColor(C.dark).font('Helvetica').fontSize(8);
    doc.text(codeText, colX.code, y, { width: colW.code });
    doc.text(item.name, colX.desc, y, { width: colW.desc });
    doc.text(item.unit, colX.unit, y, { width: colW.unit });
    doc.text(String(Number(item.quantityOrdered)), colX.ordered, y, { width: colW.ordered });
    doc.text(String(Number(item.delivered || 0)), colX.delivered, y, { width: colW.delivered });
    doc.text(money(item.unitPrice), colX.unitValue, y, { width: colW.unitValue });
    doc.text(money(item.totalValue), colX.total, y, { width: colW.total });
    doc.strokeColor(C.border).moveTo(50, y + rowHeight - 5).lineTo(545, y + rowHeight - 5).stroke();
    y += rowHeight;
  });
  doc.strokeColor('#000000');

  // totals lo calcula el controlador (mismo cálculo que ve la pantalla de detalle, ver
  // purchaseOrderService#computeOrderTotals); este fallback solo cubre llamadas directas al
  // servicio sin ese dato (scripts de prueba).
  const T = totals || items.reduce((acc, it) => {
    acc.subtotal += Number(it.totalValue);
    acc.vatTotal += Number(it.totalValue) * (Number(it.vatPercent ?? 19) / 100);
    return acc;
  }, { subtotal: 0, vatTotal: 0, retentionAmount: 0, grandTotal: 0 });
  if (!totals) T.grandTotal = T.subtotal + T.vatTotal - T.retentionAmount;
  const hasRetention = Number(T.retentionAmount) > 0;

  // El bloque de totales ocupa ~92pt (3 renglones) o ~108pt (4, con retención): si la última fila
  // de ítems terminó cerca del límite de la página, se reserva espacio en una página nueva en vez
  // de escribir más allá del margen inferior (donde quedaría invisible/cortado).
  const totalsH = hasRetention ? 90 : 72;
  if (y + totalsH + 20 > ITEMS_BOTTOM_LIMIT + 12) { doc.addPage(); y = 50; }
  y += 12;
  const totalsW = 245;
  const totalsX = 300;
  doc.roundedRect(totalsX, y, totalsW, totalsH, 6).fillAndStroke(C.brandLight, C.border);
  doc.strokeColor('#000000');
  doc.fillColor(C.dark).font('Helvetica').fontSize(9);
  let ty = y + 10;
  doc.text(`${L.subtotal}: ${money(T.subtotal)}`, totalsX + 12, ty, { width: totalsW - 24, align: 'right' });
  ty += 17;
  doc.text(`${L.tax}: ${money(T.vatTotal)}`, totalsX + 12, ty, { width: totalsW - 24, align: 'right' });
  ty += 17;
  if (hasRetention) {
    doc.fillColor('#991b1b').text(`${L.retention}: -${money(T.retentionAmount)}`, totalsX + 12, ty, { width: totalsW - 24, align: 'right' });
    doc.fillColor(C.dark);
    ty += 17;
  }
  doc.strokeColor(C.border).moveTo(totalsX + 12, ty).lineTo(totalsX + totalsW - 12, ty).stroke();
  doc.strokeColor('#000000');
  ty += 6;
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(12).text(`${L.grandTotal}: ${money(T.grandTotal)}`, totalsX + 12, ty, { width: totalsW - 24, align: 'right' });
  y += totalsH + 20;

  if (order.status === 'cerrada_con_faltantes' && order.closureReason) {
    doc.fillColor(PO_STATUS_BADGE.cerrada_con_faltantes.text).font('Helvetica-Bold').fontSize(9)
      .text(`${L.shortageReason}: `, 50, y, { continued: true })
      .font('Helvetica').text(order.closureReason);
    y = doc.y + 12;
  }
  doc.fillColor(C.dark);

  // Bloque de firmas: solo dos campos, cada uno con el nombre de la persona (sin cargo ni otro
  // dato). "Elaboró" es quien generó la orden (preparedByName, ver exportPdf en
  // purchaseOrderController.js); "Autorizó" es el gerente configurado en Administración > Datos de
  // la Empresa (company.managerName, un único valor por empresa/tenant, no un usuario del sistema).
  doc.y = y;
  if (doc.y > 680) { doc.addPage(); doc.y = 50; }
  let sigY = doc.y + 10;
  doc.strokeColor(C.border).moveTo(50, sigY - 6).lineTo(545, sigY - 6).stroke();
  doc.strokeColor('#000000');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.dark);
  doc.text(L.elaborated, 50, sigY, { width: 220 });
  doc.text(L.authorized, 320, sigY, { width: 220 });
  sigY += 16;
  doc.font('Helvetica').fontSize(10).fillColor(C.dark);
  doc.text(preparedByName || '-', 50, sigY, { width: 220 });
  doc.text(company?.managerName || '-', 320, sigY, { width: 220 });
  doc.fillColor('#000');

  doc.end();
  return doc;
}

// Tabla de datos clave (etiqueta | valor) al inicio del contrato — mismas filas y mismo orden que
// dibuja contractDocService.js en Word, a partir de content.infoTable (ver
// contractTemplates.js#buildPersonalInfoTable y afines). Las filas marcadas `changed` (otrosí) se
// resaltan en negrita/color para que el cambio salte a la vista sin perder el valor original.
function drawContractInfoTable(doc, infoTable) {
  if (!infoTable || !infoTable.length) return;
  const startX = doc.page.margins.left;
  // Ancho de la etiqueta fijo (le alcanza a las etiquetas más largas de la tabla); el valor toma
  // TODO el resto del ancho útil de la página, para que la tabla llegue hasta el margen derecho
  // igual que el resto del documento, en vez de quedar angosta a la izquierda.
  const labelWidth = 220;
  const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const valueWidth = totalWidth - labelWidth;
  doc.strokeColor('#cccccc');
  infoTable.forEach((r) => {
    doc.font('Helvetica-Bold').fontSize(9);
    const labelHeight = doc.heightOfString(r.label, { width: labelWidth - 10 });
    doc.font('Helvetica').fontSize(9);
    const valueHeight = doc.heightOfString(r.value || '-', { width: valueWidth - 10 });
    const rowHeight = Math.max(labelHeight, valueHeight) + 8;
    if (doc.y + rowHeight > 760) doc.addPage();
    const y = doc.y;
    doc.rect(startX, y, totalWidth, rowHeight).stroke();
    doc.moveTo(startX + labelWidth, y).lineTo(startX + labelWidth, y + rowHeight).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f2937').text(r.label, startX + 5, y + 4, { width: labelWidth - 10 });
    doc.font(r.changed ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(r.changed ? '#b45309' : '#000000')
      .text(r.value || '-', startX + labelWidth + 5, y + 4, { width: valueWidth - 10 });
    doc.y = y + rowHeight;
  });
  doc.strokeColor('#000000').fillColor('#000000').font('Helvetica');
  // Cada fila termina posicionando el cursor x en la columna de valor (startX + labelWidth + 5);
  // sin este reset, el párrafo que sigue (dibujado sin x explícito) hereda esa x residual y queda
  // angosto y corrido a la derecha en vez de arrancar en el margen izquierdo a ancho completo.
  doc.x = startX;
  doc.moveDown(1);
}

// Contrato/otrosí de personal: mismo membrete simple que cotizaciones/APU (logo + datos de la
// empresa), tabla de datos clave, cuerpo de párrafos justificados por cláusula, y firmas al final.
// `content` es la estructura genérica que arma contractTemplates.js#buildContractContent — la
// misma que consume contractDocService.js para el .docx, así que el texto legal vive en un solo
// lugar.
function generateContractPdf(content, company) {
  const doc = new PDFDocument({ margin: 50 });

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
  doc.fontSize(15).font('Helvetica-Bold').text(content.documentTitle, { align: 'center' });
  doc.moveDown(1);

  drawContractInfoTable(doc, content.infoTable);

  doc.fontSize(10).font('Helvetica').text(content.intro, { align: 'justify' });
  doc.moveDown(0.8);

  content.clauses.forEach((clause) => {
    if (doc.y > 700) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).text(clause.heading);
    doc.font('Helvetica').fontSize(10).text(clause.body, { align: 'justify' });
    doc.moveDown(0.6);
  });

  if (doc.y > 620) doc.addPage();
  doc.moveDown(1);
  doc.fontSize(10).text(`Para constancia, se firma en ${content.signCity || '_______________'}, a los ${content.signDate || '_______________'}.`);
  doc.moveDown(2);

  content.signatureBlock.forEach((sig) => {
    if (doc.y > 680) doc.addPage();
    doc.text('_______________________');
    doc.font('Helvetica-Bold').text(sig.role);
    doc.font('Helvetica').text(sig.name || '-');
    if (sig.idLabel) doc.text(`${sig.idLabel} ${sig.idValue || '-'}`);
    doc.moveDown(1.5);
  });

  doc.end();
  return doc;
}

// Reporte de un cálculo laboral desglosado por conceptos (nómina o liquidación) — ambos
// servicios (payrollService.js#calculatePayroll, severanceService.js#calculateSeverance) devuelven
// el mismo `breakdown.conceptos: [{concepto, formula, valor}]` + `breakdown.total`, así que un solo
// generador cubre los dos reportes sin duplicar el layout.
function generateLaborCalculationPdf({ title, employee, company, breakdown, meta }) {
  const doc = new PDFDocument({ margin: 50 });

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
  doc.fontSize(15).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica-Bold').text('Trabajador: ', { continued: true }).font('Helvetica').text(employee?.name || '-');
  if (employee?.documentNumber) {
    doc.font('Helvetica-Bold').text('Documento: ', { continued: true }).font('Helvetica').text(String(employee.documentNumber));
  }
  (meta || []).forEach(({ label, value }) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(String(value));
  });
  doc.moveDown(1);

  sectionTitle(doc, 'Detalle del cálculo');
  breakdown.conceptos.forEach((c) => {
    if (doc.y > 700) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(c.concepto, { continued: true });
    doc.font('Helvetica').text(`   ${money(c.valor)}`, { align: 'right' });
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555').text(c.formula);
    doc.fillColor('#000').fontSize(10);
    doc.moveDown(0.5);
  });

  doc.moveDown(0.5);
  doc.strokeColor('#1f2937').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).text(`TOTAL: ${money(breakdown.total)}`, { align: 'right' });

  doc.end();
  return doc;
}

module.exports = {
  generateProjectReportPdf, generateQuotationPdf, generateApuPdf, generateBudgetWithApuAnnexPdf, generatePurchaseOrderPdf, generateContractPdf, generateLaborCalculationPdf, money,
};
