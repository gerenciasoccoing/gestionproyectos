// Apoyo para contratos de personal subidos como documento externo (ver
// employeeContractController.js#uploadExternal/replaceFile y contractSignatureService.js), en vez
// de generados desde contractTemplates.js. Dos operaciones, ambas sobre bytes crudos, sin tocar
// ningún modelo: convertir lo subido a un PDF que se pueda ver/firmar, y estampar el certificado de
// firma electrónica sobre ESE PDF (en vez de regenerar el documento completo, que no es posible
// para un documento externo — no hay ningún `content` estructurado del que partir).
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const mammoth = require('mammoth');
const PDFKit = require('pdfkit');

const IMAGE_MIME_TO_EMBED = {
  'image/jpeg': 'embedJpg',
  'image/jpg': 'embedJpg',
  'image/png': 'embedPng',
};

function pdfKitDocToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// Un .docx no tiene lectura nativa por la IA de visión (ver aiVisionService.js) ni un camino de
// firma — se convierte primero a texto plano (mammoth) y se reconstruye como un PDF simple con
// PDFKit (mismo motor que ya usa el resto de la app para generar PDFs). Se pierde el formato
// original del Word, pero el archivo subido tal cual queda intacto en originalFilePath — esto solo
// produce una versión LEGIBLE Y FIRMABLE del mismo contenido.
async function docxBufferToPdf(buffer) {
  const { value: text } = await mammoth.extractRawText({ buffer });
  const doc = new PDFKit({ margin: 50 });
  doc.fontSize(9).fillColor('#888')
    .text('Documento convertido automáticamente desde Word para su lectura y firma digital. El archivo original queda disponible como "Documento original" en el historial de contratos.', { align: 'left' });
  doc.moveDown(1);
  doc.fillColor('#000').fontSize(10).font('Helvetica');
  const paragraphs = text.split(/\n+/).filter((p) => p.trim());
  paragraphs.forEach((p) => {
    if (doc.y > 700) doc.addPage();
    doc.text(p, { align: 'justify' });
    doc.moveDown(0.5);
  });
  return pdfKitDocToBuffer(doc);
}

// Una imagen se embebe tal cual en una sola página de un PDF nuevo (sin pérdida de calidad ni
// reinterpretación de contenido) — a diferencia del .docx, esto SÍ es una representación fiel del
// archivo original, solo que envuelta en PDF para poder firmarse por el mismo flujo.
async function imageBufferToPdf(buffer, mimetype) {
  const embedMethod = IMAGE_MIME_TO_EMBED[mimetype];
  if (!embedMethod) throw new Error(`Formato de imagen no soportado para conversión a PDF: ${mimetype}`);
  const pdfDoc = await PDFDocument.create();
  const image = await pdfDoc[embedMethod](buffer);
  const { width, height } = image.scale(1);
  // Tamaño carta como techo: una foto de celular en alta resolución no debe producir una página
  // del tamaño físico de la foto — se escala para caber, nunca se recorta.
  const maxWidth = 540;
  const maxHeight = 720;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const pageWidth = width * scale;
  const pageHeight = height * scale;
  const page = pdfDoc.addPage([pageWidth + 40, pageHeight + 40]);
  page.drawImage(image, { x: 20, y: 20, width: pageWidth, height: pageHeight });
  return Buffer.from(await pdfDoc.save());
}

// Punto de entrada único desde employeeContractController.js: a cada mimetype le corresponde un
// único camino, y un PDF ya subido se devuelve intacto (nada que convertir).
async function convertToSignablePdf({ buffer, mimetype }) {
  if (mimetype === 'application/pdf') return buffer;
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimetype === 'application/msword') {
    return docxBufferToPdf(buffer);
  }
  if (IMAGE_MIME_TO_EMBED[mimetype]) return imageBufferToPdf(buffer, mimetype);
  throw new Error(`No se puede convertir este tipo de archivo a PDF: ${mimetype}`);
}

// Firma de un contrato EXTERNO (ver contractSignatureService.js#signDocument, que para
// doc.source==='generado' sigue regenerando el documento completo desde contractTemplates.js, sin
// tocar nada de esto): en vez de reconstruir el documento, se le agrega una página nueva al PDF
// YA guardado (pdfFilePath, ver convertToSignablePdf arriba) con el mismo contenido de
// certificación que generateContractPdf agrega para un contrato generado — mismo texto/criterio,
// implementado con pdf-lib porque PDFKit no puede reabrir/editar un PDF existente.
async function appendSignatureCertificate({ pdfBuffer, dataUrl, signerName, signedAt, ip }) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([612, 792]); // carta
  let y = 742;

  page.drawText('Certificado de firma electrónica', { x: 50, y, size: 13, font: fontBold });
  y -= 30;

  if (dataUrl) {
    try {
      const base64 = dataUrl.split(',')[1] || dataUrl;
      const imgBuffer = Buffer.from(base64, 'base64');
      const isPng = dataUrl.startsWith('data:image/png');
      const image = isPng ? await pdfDoc.embedPng(imgBuffer) : await pdfDoc.embedJpg(imgBuffer);
      const { width, height } = image.scale(1);
      const boxWidth = 200;
      const boxHeight = 80;
      const scale = Math.min(boxWidth / width, boxHeight / height, 1);
      page.drawRectangle({ x: 50, y: y - boxHeight, width: boxWidth, height: boxHeight, borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 1 });
      page.drawImage(image, {
        x: 50 + (boxWidth - width * scale) / 2, y: y - boxHeight + (boxHeight - height * scale) / 2,
        width: width * scale, height: height * scale,
      });
      y -= boxHeight + 16;
    } catch { /* imagen de firma ilegible: se omite, el certificado de texto sigue siendo válido */ }
  }

  const signedAtLabel = signedAt instanceof Date ? signedAt.toLocaleString('es-CO') : String(signedAt);
  [
    `Firmado electrónicamente por: ${signerName}`,
    `Fecha y hora: ${signedAtLabel}`,
    `Dirección IP: ${ip || 'No disponible'}`,
  ].forEach((line) => {
    page.drawText(line, { x: 50, y, size: 9, font });
    y -= 14;
  });

  return Buffer.from(await pdfDoc.save());
}

module.exports = { convertToSignablePdf, appendSignatureCertificate };
