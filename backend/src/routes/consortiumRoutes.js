const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const consortiumController = require('../controllers/consortiumController');

const upload = makeUploader('consortiums', 'image');

router.use(authenticate);

// list/get gateados por 'proyectos':'view' (no 'admin':'view'): cualquier usuario que pueda ver
// proyectos necesita listar los consorcios para el selector al crear/editar uno, o simplemente
// para ver cuál está asignado — igual al patrón ya usado con el catálogo de EPS/pensión/ARL
// (gateado por 'personal':'view' aunque el CRUD completo es 'admin':*). Crear/editar/eliminar sí
// queda restringido a Administración.
router.get('/', requirePermission('proyectos', 'view'), consortiumController.list);
router.get('/:id', requirePermission('proyectos', 'view'), consortiumController.get);
router.post('/', requirePermission('admin', 'create'), upload.single('logo'), preventDuplicateSubmit, consortiumController.create);
router.put('/:id', requirePermission('admin', 'edit'), upload.single('logo'), consortiumController.update);
router.delete('/:id', requirePermission('admin', 'delete'), consortiumController.remove);

module.exports = router;
