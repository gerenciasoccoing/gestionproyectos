const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Minute } = require('../models');
const { relativePath } = require('../middleware/upload');

const list = asyncHandler(async (req, res) => {
  const minutes = await Minute.findAll({ where: { projectId: req.params.projectId }, order: [['date', 'DESC']] });
  res.json(minutes);
});

const create = asyncHandler(async (req, res) => {
  const { type, date } = req.body;
  const validTypes = ['inicio', 'suspension', 'reinicio', 'terminacion', 'final', 'liquidacion'];
  if (!type || !validTypes.includes(type)) throw new ApiError(400, `type debe ser uno de: ${validTypes.join(', ')}`);
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar el documento PDF del acta');

  const minute = await Minute.create({
    projectId: req.params.projectId,
    type,
    date,
    filePath: relativePath(req.file),
  });
  res.status(201).json(minute);
});

const remove = asyncHandler(async (req, res) => {
  const minute = await Minute.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!minute) throw new ApiError(404, 'Acta no encontrada');
  await minute.destroy();
  res.status(204).send();
});

module.exports = { list, create, remove };
