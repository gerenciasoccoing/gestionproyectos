const router = require('express').Router();
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const contractSignatureController = require('../controllers/contractSignatureController');

// Rutas públicas (sin sesión, sin authenticate): la persona que firma no tiene cuenta en la
// plataforma — el token largo y de un solo uso en la URL ES la autenticación acá, mismo criterio
// que companyRegistrationRoutes.js/inventoryConfirmationRoutes.js.
router.get('/:token', contractSignatureController.get);
router.get('/:token/document', contractSignatureController.getDocument);
router.post('/:token', preventDuplicateSubmit, contractSignatureController.sign);

module.exports = router;
