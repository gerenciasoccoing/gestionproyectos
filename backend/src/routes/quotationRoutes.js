const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const quotationController = require('../controllers/quotationController');

router.use(authenticate);

router.get('/', requirePermission('cotizaciones', 'view'), quotationController.list);
router.post('/', requirePermission('cotizaciones', 'create'), quotationController.create);
router.get('/:id', requirePermission('cotizaciones', 'view'), quotationController.get);
router.put('/:id', requirePermission('cotizaciones', 'edit'), quotationController.update);
router.delete('/:id', requirePermission('cotizaciones', 'delete'), quotationController.remove);
router.post('/:id/items', requirePermission('cotizaciones', 'edit'), quotationController.addItem);
router.delete('/:id/items/:itemId', requirePermission('cotizaciones', 'edit'), quotationController.removeItem);
router.get('/:id/pdf', requirePermission('cotizaciones', 'view'), quotationController.exportPdf);
router.post('/:id/convert', requirePermission('cotizaciones', 'edit'), quotationController.convert);

module.exports = router;
