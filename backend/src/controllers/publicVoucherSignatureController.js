// Controlador PÚBLICO (sin sesión, ver voucherSignatureRoutes.js): quien firma un comprobante de
// egreso/ingreso por este camino no tiene cuenta en la plataforma (p. ej. el proveedor de "Recibí
// conforme") — el token largo y de un solo uso que llega en la URL ES la autenticación acá, mismo
// criterio que contractSignatureController.js/companyRegistrationController.js.
const asyncHandler = require('../utils/asyncHandler');
const voucherSignatureService = require('../services/voucherSignatureService');
const { generateExpenseReceiptPdf, generateCashIncomeReceiptPdf } = require('../services/pdfService');

const get = asyncHandler(async (req, res) => {
  const { signature, status, voucherType, full } = await voucherSignatureService.getVoucherPdfIngredients(req.params.token);
  res.json({
    status,
    roleLabel: voucherSignatureService.ROLE_LABELS[signature.role],
    voucherLabel: voucherSignatureService.voucherLabelFor(voucherType, full),
    projectName: full.Project?.name || null,
    signedAt: signature.signedAt,
  });
});

// Sirve el comprobante EN VIVO (nunca un archivo persistido, mismo criterio que
// expenseController.js#exportReceiptPdf/cashBoxController.js#exportMovementReceiptPdf) con las
// firmas de los demás roles ya dibujadas, para que quien va a firmar vea el documento real.
const getDocument = asyncHandler(async (req, res) => {
  const { voucherType, full, company, signatures } = await voucherSignatureService.getVoucherPdfIngredients(req.params.token);
  const doc = voucherType === 'gasto'
    ? generateExpenseReceiptPdf({ expense: full, company, signatures })
    : generateCashIncomeReceiptPdf({ movement: full, company, signatures });
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);
});

const sign = asyncHandler(async (req, res) => {
  const { signatureDataUrl, signerName } = req.body;
  const signature = await voucherSignatureService.signExternal({
    rawToken: req.params.token,
    signatureDataUrl,
    signerName,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ status: 'firmado', signedAt: signature.signedAt });
});

module.exports = { get, getDocument, sign };
