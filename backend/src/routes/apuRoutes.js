const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const apuController = require('../controllers/apuController');

router.use(authenticate);

router.get('/', requirePermission('cotizaciones', 'view'), apuController.list);
router.post('/', requirePermission('cotizaciones', 'create'), apuController.create);
router.get('/:id', requirePermission('cotizaciones', 'view'), apuController.get);
router.put('/:id', requirePermission('cotizaciones', 'edit'), apuController.update);
router.delete('/:id', requirePermission('cotizaciones', 'delete'), apuController.remove);
router.post('/:id/components', requirePermission('cotizaciones', 'edit'), apuController.addComponent);
router.delete('/:id/components/:componentId', requirePermission('cotizaciones', 'edit'), apuController.removeComponent);

module.exports = router;
