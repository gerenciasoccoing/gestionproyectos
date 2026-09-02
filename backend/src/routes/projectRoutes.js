const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const { makeUploader } = require('../middleware/upload');
const projectController = require('../controllers/projectController');

router.use(authenticate);

const uploadProjectPhoto = makeUploader('project-photos', 'image');

router.get('/', requirePermission('proyectos', 'view'), projectController.list);
router.post('/', requirePermission('proyectos', 'create'), preventDuplicateSubmit, projectController.create);
router.get('/:id', requirePermission('proyectos', 'view'), requireProjectAccess((r) => r.params.id), projectController.get);
router.put('/:id', requirePermission('proyectos', 'edit'), requireProjectAccess((r) => r.params.id), projectController.update);
router.delete('/:id', requirePermission('proyectos', 'delete'), requireProjectAccess((r) => r.params.id), projectController.remove);
router.put('/:id/users', requirePermission('proyectos', 'edit'), requireProjectAccess((r) => r.params.id), projectController.assignUsers);
router.post('/:id/presentation-photo', requirePermission('proyectos', 'edit'), requireProjectAccess((r) => r.params.id), uploadProjectPhoto.single('file'), projectController.uploadPresentationPhoto);
router.post('/:id/location-map', requirePermission('proyectos', 'edit'), requireProjectAccess((r) => r.params.id), uploadProjectPhoto.single('file'), projectController.uploadLocationMap);

module.exports = router;
