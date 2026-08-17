const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const thirdPartyController = require('../controllers/thirdPartyController');

const upload = makeUploader('third-parties', 'any');
const uploadFiles = upload.fields([
  { name: 'rutFile', maxCount: 1 },
  { name: 'bankCertificationFile', maxCount: 1 },
]);

// En memoria (no se persiste): solo se usa para leer el RUT y descartarlo; el archivo definitivo
// se vuelve a subir (a disco, vía `uploadFiles`) cuando el usuario confirma el formulario.
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

router.use(authenticate);

router.post('/scan-rut', requirePermission('terceros', 'create'), scanUpload.single('file'), thirdPartyController.scanRutFile);

router.get('/', requirePermission('terceros', 'view'), thirdPartyController.list);
router.post('/', requirePermission('terceros', 'create'), uploadFiles, thirdPartyController.create);
router.get('/:id', requirePermission('terceros', 'view'), thirdPartyController.get);
router.get('/:id/projects', requirePermission('terceros', 'view'), thirdPartyController.getClientProjects);
router.put('/:id', requirePermission('terceros', 'edit'), uploadFiles, thirdPartyController.update);
router.delete('/:id', requirePermission('terceros', 'delete'), thirdPartyController.remove);

module.exports = router;
