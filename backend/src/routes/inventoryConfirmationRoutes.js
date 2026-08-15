const router = require('express').Router();
const inventoryConfirmationController = require('../controllers/inventoryConfirmationController');

// Sin `authenticate`: la persona responsable abre este enlace desde WhatsApp sin sesión en la
// app. La seguridad del recurso es el token (192 bits aleatorios) en la URL, no un rol/permiso.
router.get('/:token', inventoryConfirmationController.get);
router.post('/:token/confirm', inventoryConfirmationController.confirm);

module.exports = router;
