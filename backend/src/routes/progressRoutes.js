const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const progressController = require('../controllers/progressController');

const upload = makeUploader('progress-photos', 'image');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/items/:itemId/entries', requirePermission('ejecucion', 'view'), progressController.listEntries);
router.post('/items/:itemId/entries', requirePermission('ejecucion', 'create'), upload.array('photos', 20), progressController.createEntry);
router.delete('/items/:itemId/entries/:entryId', requirePermission('ejecucion', 'delete'), progressController.removeEntry);

module.exports = router;
