// Genera el .docx de un contrato/otrosí a partir de la misma estructura que consume
// pdfService.js#generateContractPdf (ver contractTemplates.js#buildContractContent) — un solo
// lugar con el texto legal, dos formatos de salida.
const { Document, Paragraph, TextRun, AlignmentType, Packer, HeadingLevel } = require('docx');

function buildDocxDocument(content) {
  const children = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 300 },
    children: [new TextRun({ text: content.documentTitle, bold: true })],
  }));

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
