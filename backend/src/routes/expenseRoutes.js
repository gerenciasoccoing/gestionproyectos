const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const expenseController = require('../controllers/expenseController');

const upload = makeUploader('expenses', 'any');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/summary', requirePermission('gastos', 'view'), expenseController.summary);
router.post('/budget', requirePermission('gastos', 'edit'), expenseController.setBudget);
router.get('/', requirePermission('gastos', 'view'), expenseController.list);
router.post('/', requirePermission('gastos', 'create'), upload.single('file'), expenseController.create);
router.put('/:id', requirePermission('gastos', 'edit'), upload.single('file'), expenseController.update);
router.delete('/:id', requirePermission('gastos', 'delete'), expenseController.remove);

module.exports = router;
