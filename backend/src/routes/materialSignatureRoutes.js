const router = require('express').Router();
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const publicMaterialSignatureController = require('../controllers/publicMaterialSignatureController');

// Rutas públicas (sin sesión, sin authenticate) — mismo criterio que voucherSignatureRoutes.js/
// contractSignatureRoutes.js: el token largo y de un solo uso en la URL ES la autenticación.
// Genérico para traslado/salida/devolución (ver publicMaterialSignatureController.js).
router.get('/:token', publicMaterialSignatureController.get);
router.get('/:token/document', publicMaterialSignatureController.getDocument);
router.post('/:token/sign', preventDuplicateSubmit, publicMaterialSignatureController.sign);
router.post('/:token/reject', preventDuplicateSubmit, publicMaterialSignatureController.reject);

module.exports = router;
