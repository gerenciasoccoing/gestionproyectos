const multer = require('multer');
const path = require('path');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const contractController = require('../controllers/contractController');
const aiDocumentController = require('../controllers/aiDocumentController');

const upload = makeUploader('contracts', 'document');

// En memoria (no se persiste): solo se usa para leer el contrato con IA y descartarlo; el
// archivo definitivo se vuelve a subir (a disco) cuando el usuario confirma el formulario.
const scanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return cb(new Error('El archivo debe ser PDF, JPG, PNG o WEBP'));
    }
    cb(null, true);
  },
});

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.post('/scan', requirePermission('contractual', 'create'), scanUpload.single('file'), aiDocumentController.scanDocument('contract'));
router.get('/', requirePermission('contractual', 'view'), contractController.list);
router.post('/', requirePermission('contractual', 'create'), upload.single('file'), contractController.create);
router.put('/:id', requirePermission('contractual', 'edit'), upload.single('file'), contractController.update);
router.delete('/:id', requirePermission('contractual', 'delete'), contractController.remove);

module.exports = router;
