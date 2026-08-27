const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const inventoryItemController = require('../controllers/inventoryItemController');

const upload = makeUploader('inventory', 'image');

router.use(authenticate);

router.get('/', requirePermission('inventario', 'view'), inventoryItemController.list);
router.post('/', requirePermission('inventario', 'create'), upload.single('photo'), preventDuplicateSubmit, inventoryItemController.create);
router.get('/:id', requirePermission('inventario', 'view'), inventoryItemController.get);
router.get('/:id/history', requirePermission('inventario', 'view'), inventoryItemController.history);
router.put('/:id', requirePermission('inventario', 'edit'), upload.single('photo'), inventoryItemController.update);
router.delete('/:id', requirePermission('inventario', 'delete'), inventoryItemController.remove);

module.exports = router;
