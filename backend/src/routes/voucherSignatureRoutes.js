const router = require('express').Router();
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const publicVoucherSignatureController = require('../controllers/publicVoucherSignatureController');

// Rutas públicas (sin sesión, sin authenticate) — mismo criterio que contractSignatureRoutes.js: el
// token largo y de un solo uso en la URL ES la autenticación acá.
router.get('/:token', publicVoucherSignatureController.get);
router.get('/:token/document', publicVoucherSignatureController.getDocument);
router.post('/:token', preventDuplicateSubmit, publicVoucherSignatureController.sign);

module.exports = router;
