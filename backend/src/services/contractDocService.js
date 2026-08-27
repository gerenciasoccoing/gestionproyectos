// Genera el .docx de un contrato/otrosí a partir de la misma estructura que consume
// pdfService.js#generateContractPdf (ver contractTemplates.js#buildContractContent) — un solo
// lugar con el texto legal, dos formatos de salida.
const {
  Document, Paragraph, TextRun, AlignmentType, Packer, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} = require('docx');

// Mismas filas y mismo orden que dibuja pdfService.js#drawContractInfoTable, a partir de
// content.infoTable (ver contractTemplates.js) — así Word y PDF nunca quedan desincronizados. Las
// filas marcadas `changed` (otrosí) se resaltan en negrita/color.
function buildInfoTableElement(infoTable) {
  const cellBorder = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' };
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
  const rows = infoTable.map((r) => new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        borders,
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: r.label, bold: true })] })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        borders,
        margins: { top: 80, bottom: 80, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: r.value || '-', bold: !!r.changed, color: r.changed ? 'B45309' : undefined })] })],
      }),
    ],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function buildDocxDocument(content) {
  const children = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 300 },
    children: [new TextRun({ text: content.documentTitle, bold: true })],
  }));

  if (content.infoTable && content.infoTable.length) {
    children.push(buildInfoTableElement(content.infoTable));
    children.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 300 },
    children: [new TextRun({ text: content.intro })],
  }));

  content.clauses.forEach((clause) => {
    children.push(new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: clause.heading, bold: true })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 100 },
      children: [new TextRun({ text: clause.body })],
    }));
  });

  children.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: `Para constancia, se firma en ${content.signCity || '_______________'}, a los ${content.signDate || '_______________'}.` })] }));

  content.signatureBlock.forEach((sig) => {
    children.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: '_______________________' })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: sig.role, bold: true })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: sig.name || '-' })] }));
    if (sig.idLabel) children.push(new Paragraph({ children: [new TextRun({ text: `${sig.idLabel} ${sig.idValue || '-'}` })] }));
  });

  return new Document({ sections: [{ children }] });
}

async function generateContractDocxBuffer(content) {
  const doc = buildDocxDocument(content);
  return Packer.toBuffer(doc);
}

module.exports = { generateContractDocxBuffer };
