const router = require('express').Router();
const companyRegistrationController = require('../controllers/companyRegistrationController');

// Sin authenticate: es el formulario público "Registrar empresa" del login.
router.post('/', companyRegistrationController.create);

module.exports = router;
