const multer = require('multer');
const path = require('path');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess, requireFeature } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const marketStudyController = require('../controllers/marketStudyController');

const upload = makeUploader('market-study-quotations', 'quotation');

// En memoria (no se persiste): solo para leer la cotización con IA y descartarla — igual que el
// escaneo de contratos (ver contractRoutes.js). El archivo definitivo se sube (a disco) cuando el
// usuario confirma el formulario de la cotización.
const scanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xlsx', '.xls'].includes(ext)) {
      return cb(new Error('El archivo debe ser PDF, imagen (jpg, png, webp) o Excel (xlsx, xls)'));
    }
    cb(null, true);
  },
});

router.use(authenticate, requireFeature('estudio_mercado'), requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('estudio_mercado', 'view'), marketStudyController.list);
router.post('/', requirePermission('estudio_mercado', 'create'), preventDuplicateSubmit, marketStudyController.create);
router.get('/:id', requirePermission('estudio_mercado', 'view'), marketStudyController.get);
router.put('/:id', requirePermission('estudio_mercado', 'edit'), marketStudyController.update);
router.delete('/:id', requirePermission('estudio_mercado', 'delete'), marketStudyController.remove);
router.get('/:id/comparison', requirePermission('estudio_mercado', 'view'), marketStudyController.comparison);
router.post('/:id/scan', requirePermission('estudio_mercado', 'create'), scanUpload.single('file'), marketStudyController.scanQuotation);
router.post('/:id/quotations', requirePermission('estudio_mercado', 'create'), upload.single('file'), preventDuplicateSubmit, marketStudyController.addQuotation);
router.put('/:id/quotations/:quotationId', requirePermission('estudio_mercado', 'edit'), marketStudyController.updateQuotation);
router.delete('/:id/quotations/:quotationId', requirePermission('estudio_mercado', 'delete'), marketStudyController.removeQuotation);
router.post('/:id/generate-draft', requirePermission('estudio_mercado', 'create'), requirePermission('ordenes_compra', 'create'), preventDuplicateSubmit, marketStudyController.generateDraft);

module.exports = router;
