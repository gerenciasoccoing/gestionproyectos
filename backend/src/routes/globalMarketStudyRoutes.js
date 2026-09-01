const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireOptionalProjectAccess, requireFeature } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const { MarketStudy } = require('../models');
const marketStudyController = require('../controllers/marketStudyController');

// Montado en /market-studies (sin :projectId en la URL): punto de entrada usado desde el menú
// principal, donde el proyecto es opcional — mismo controlador que
// /projects/:projectId/market-studies (marketStudyRoutes.js). Ver el comentario equivalente en
// globalPurchaseOrderRoutes.js.
const upload = makeUploader('market-study-quotations', 'quotation');

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

router.use(authenticate, requireFeature('estudio_mercado'));

const byIdParam = async (req) => MarketStudy.findByPk(req.params.id);

router.get('/', requirePermission('estudio_mercado', 'view'), marketStudyController.list);
router.post('/', requirePermission('estudio_mercado', 'create'), preventDuplicateSubmit, marketStudyController.create);
router.get('/:id', requirePermission('estudio_mercado', 'view'), requireOptionalProjectAccess(byIdParam), marketStudyController.get);
router.put('/:id', requirePermission('estudio_mercado', 'edit'), requireOptionalProjectAccess(byIdParam), marketStudyController.update);
router.delete('/:id', requirePermission('estudio_mercado', 'delete'), requireOptionalProjectAccess(byIdParam), marketStudyController.remove);
router.get('/:id/comparison', requirePermission('estudio_mercado', 'view'), requireOptionalProjectAccess(byIdParam), marketStudyController.comparison);
router.post('/:id/scan', requirePermission('estudio_mercado', 'create'), requireOptionalProjectAccess(byIdParam), scanUpload.single('file'), marketStudyController.scanQuotation);
router.post('/:id/quotations', requirePermission('estudio_mercado', 'create'), requireOptionalProjectAccess(byIdParam), upload.single('file'), preventDuplicateSubmit, marketStudyController.addQuotation);
router.put('/:id/quotations/:quotationId', requirePermission('estudio_mercado', 'edit'), requireOptionalProjectAccess(byIdParam), marketStudyController.updateQuotation);
router.delete('/:id/quotations/:quotationId', requirePermission('estudio_mercado', 'delete'), requireOptionalProjectAccess(byIdParam), marketStudyController.removeQuotation);
router.post('/:id/generate-draft', requirePermission('estudio_mercado', 'create'), requirePermission('ordenes_compra', 'create'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, marketStudyController.generateDraft);

module.exports = router;
