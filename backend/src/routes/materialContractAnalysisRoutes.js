const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const materialContractAnalysisController = require('../controllers/materialContractAnalysisController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('inventario_materiales', 'view'), materialContractAnalysisController.get);
router.get('/pdf', requirePermission('inventario_materiales', 'view'), materialContractAnalysisController.exportPdf);
router.get('/excel', requirePermission('inventario_materiales', 'view'), materialContractAnalysisController.exportExcel);

module.exports = router;
