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
// tabla resumen de ítems, subtotal, AIU, total y condiciones.
function generateQuotationPdf({ quotation, items, company }) {
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
  doc.text(`AIU: ${money(totalAiu)}`, 300, y, { align: 'right', width: 245 });
  y += 16;
  doc.font('Helvetica-Bold').fontSize(11).text(`TOTAL: ${money(total)}`, 300, y, { align: 'right', width: 245 });

  doc.moveDown(3);
  sectionTitle(doc, 'Condiciones');
  doc.font('Helvetica').fontSize(9).text(quotation.paymentTerms || 'Forma de pago a definir.');

  doc.end();
  return doc;
}

module.exports = { generateProjectReportPdf, generateQuotationPdf, money };
