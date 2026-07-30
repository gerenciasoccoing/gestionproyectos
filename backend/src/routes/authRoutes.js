const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
