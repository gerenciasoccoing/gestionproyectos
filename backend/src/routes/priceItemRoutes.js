const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const priceItemController = require('../controllers/priceItemController');

router.use(authenticate);

router.get('/', requirePermission('cotizaciones', 'view'), priceItemController.list);
router.post('/', requirePermission('cotizaciones', 'create'), priceItemController.create);
router.get('/:id', requirePermission('cotizaciones', 'view'), priceItemController.get);
router.put('/:id', requirePermission('cotizaciones', 'edit'), priceItemController.update);
router.put('/:id/value', requirePermission('cotizaciones', 'edit'), priceItemController.updateValue);
router.delete('/:id', requirePermission('cotizaciones', 'delete'), priceItemController.remove);

module.exports = router;
