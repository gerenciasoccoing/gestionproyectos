const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const projectController = require('../controllers/projectController');

router.use(authenticate);

router.get('/', requirePermission('proyectos', 'view'), projectController.list);
router.post('/', requirePermission('proyectos', 'create'), projectController.create);
router.get('/:id', requirePermission('proyectos', 'view'), requireProjectAccess((r) => r.params.id), projectController.get);
router.put('/:id', requirePermission('proyectos', 'edit'), requireProjectAccess((r) => r.params.id), projectController.update);
router.delete('/:id', requirePermission('proyectos', 'delete'), requireProjectAccess((r) => r.params.id), projectController.remove);
router.put('/:id/users', requirePermission('proyectos', 'edit'), requireProjectAccess((r) => r.params.id), projectController.assignUsers);

module.exports = router;
