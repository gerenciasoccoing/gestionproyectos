const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Policy } = require('../models');
const { relativePath } = require('../middleware/upload');

const list = asyncHandler(async (req, res) => {
  const policies = await Policy.findAll({ where: { projectId: req.params.projectId }, order: [['coverageStart', 'DESC']] });
  res.json(policies);
});

const create = asyncHandler(async (req, res) => {
  const { type, value, coverageStart, coverageEnd } = req.body;
  if (!type || value === undefined || !coverageStart || !coverageEnd) {
    throw new ApiError(400, 'type, value, coverageStart y coverageEnd son obligatorios');
  }
  if (Number(value) < 0) throw new ApiError(400, 'El valor no puede ser negativo');
  if (new Date(coverageEnd) < new Date(coverageStart)) {
    throw new ApiError(400, 'La fecha fin de cobertura no puede ser anterior a la fecha de inicio');
  }

  const policy = await Policy.create({
    projectId: req.params.projectId,
    type,
    value,
    coverageStart,
    coverageEnd,
    filePath: relativePath(req.file),
  });
  res.status(201).json(policy);
});

const update = asyncHandler(async (req, res) => {
  const policy = await Policy.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!policy) throw new ApiError(404, 'Póliza no encontrada');

  const { type, value, coverageStart, coverageEnd } = req.body;
  const nextStart = coverageStart ?? policy.coverageStart;
  const nextEnd = coverageEnd ?? policy.coverageEnd;
  if (new Date(nextEnd) < new Date(nextStart)) {
    throw new ApiError(400, 'La fecha fin de cobertura no puede ser anterior a la fecha de inicio');
  }
  if (value !== undefined && Number(value) < 0) throw new ApiError(400, 'El valor no puede ser negativo');

  if (type !== undefined) policy.type = type;
  if (value !== undefined) policy.value = value;
  if (coverageStart !== undefined) policy.coverageStart = coverageStart;
  if (coverageEnd !== undefined) policy.coverageEnd = coverageEnd;
  if (req.file) policy.filePath = relativePath(req.file);
  await policy.save();
  res.json(policy);
});

const remove = asyncHandler(async (req, res) => {
  const policy = await Policy.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!policy) throw new ApiError(404, 'Póliza no encontrada');
  await policy.destroy();
  res.status(204).send();
});

module.exports = { list, create, update, remove };
