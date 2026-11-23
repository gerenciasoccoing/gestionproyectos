const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const materialKardexController = require('../controllers/materialKardexController');

router.use(authenticate);

router.get('/', requirePermission('inventario_materiales', 'view'), materialKardexController.list);

module.exports = router;
