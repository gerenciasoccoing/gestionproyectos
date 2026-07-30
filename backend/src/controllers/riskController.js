const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Risk } = require('../models');

const list = asyncHandler(async (req, res) => {
  const risks = await Risk.findAll({ where: { projectId: req.params.projectId }, order: [['createdAt', 'DESC']] });
  res.json(risks);
});

const create = asyncHandler(async (req, res) => {
  const { description, impact, probability } = req.body;
  if (!description || !impact || !probability) throw new ApiError(400, 'description, impact y probability son obligatorios');
  const risk = await Risk.create({ projectId: req.params.projectId, description, impact, probability });
  res.status(201).json(risk);
});

const update = asyncHandler(async (req, res) => {
  const risk = await Risk.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!risk) throw new ApiError(404, 'Riesgo no encontrado');
  const { description, impact, probability, status } = req.body;
  if (description !== undefined) risk.description = description;
  if (impact !== undefined) risk.impact = impact;
  if (probability !== undefined) risk.probability = probability;
  if (status !== undefined) risk.status = status;
  await risk.save();
  res.json(risk);
});

const remove = asyncHandler(async (req, res) => {
  const risk = await Risk.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!risk) throw new ApiError(404, 'Riesgo no encontrado');
  await risk.destroy();
  res.status(204).send();
});

module.exports = { list, create, update, remove };
