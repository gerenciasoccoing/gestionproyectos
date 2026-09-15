const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ProjectDeliveryDocument, User } = require('../models');
const { relativePath } = require('../middleware/upload');

const CATEGORIES = ['factura', 'acta_entrega', 'liquidacion', 'informe_final', 'otro'];

const list = asyncHandler(async (req, res) => {
  const docs = await ProjectDeliveryDocument.findAll({
    where: { projectId: req.params.projectId },
    include: [{ model: User, as: 'uploader', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(docs);
});

// No exige que el proyecto esté activo: la carga de documentos de cierre debe seguir disponible
// aunque el proyecto ya esté en estado "terminado" (ver projectController.js#update, que no
// bloquea ninguna otra acción según el estado del proyecto).
const create = asyncHandler(async (req, res) => {
  const { category, customName } = req.body;
  if (!category || !CATEGORIES.includes(category)) {
    throw new ApiError(400, `category debe ser una de: ${CATEGORIES.join(', ')}`);
  }
  if (category === 'otro' && !String(customName || '').trim()) {
    throw new ApiError(400, 'Debe indicar un nombre para el documento adicional');
  }
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo');

  const doc = await ProjectDeliveryDocument.create({
    projectId: req.params.projectId,
    category,
    customName: category === 'otro' ? customName.trim() : null,
    filePath: relativePath(req.file),
    uploadedBy: req.user.id,
  });
  const full = await ProjectDeliveryDocument.findByPk(doc.id, {
    include: [{ model: User, as: 'uploader', attributes: ['id', 'name'] }],
  });
  res.status(201).json(full);
});

const remove = asyncHandler(async (req, res) => {
  const doc = await ProjectDeliveryDocument.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!doc) throw new ApiError(404, 'Documento no encontrado');
  await doc.destroy();
  res.status(204).send();
});

module.exports = { list, create, remove, CATEGORIES };
