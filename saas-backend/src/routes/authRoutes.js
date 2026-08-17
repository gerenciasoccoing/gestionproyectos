const express = require('express');
const authController = require('../controllers/authController');
const { authenticateStaff } = require('../middleware/auth');

const router = express.Router();

router.post('/login', authController.login);
router.get('/me', authenticateStaff, authController.me);

module.exports = router;
