const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const publicHolidayController = require('../controllers/publicHolidayController');

router.use(authenticate);

// Sin requirePermission en GET: cualquiera que registre vacaciones necesita poder ver (o al menos
// que el sistema use) el calendario, aunque solo Administración lo edite.
router.get('/', publicHolidayController.list);
router.post('/', requirePermission('admin', 'create'), publicHolidayController.create);
router.put('/:id', requirePermission('admin', 'edit'), publicHolidayController.update);
router.delete('/:id', requirePermission('admin', 'delete'), publicHolidayController.remove);

module.exports = router;
