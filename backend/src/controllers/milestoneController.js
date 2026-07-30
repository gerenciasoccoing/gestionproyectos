const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Milestone } = require('../models');

const list = asyncHandler(async (req, res) => {
  const milestones = await Milestone.findAll({ where: { projectId: req.params.projectId }, order: [['plannedDate', 'ASC']] });
  res.json(milestones);
});

const create = asyncHandler(async (req, res) => {
  const { name, plannedDate } = req.body;
  if (!name || !plannedDate) throw new ApiError(400, 'name y plannedDate son obligatorios');
  const milestone = await Milestone.create({ projectId: req.params.projectId, name, plannedDate });
  res.status(201).json(milestone);
});

const update = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!milestone) throw new ApiError(404, 'Hito no encontrado');
  const { name, plannedDate, actualDate, status } = req.body;
  if (name !== undefined) milestone.name = name;
  if (plannedDate !== undefined) milestone.plannedDate = plannedDate;
  if (actualDate !== undefined) milestone.actualDate = actualDate === '' ? null : actualDate;
  if (status !== undefined) milestone.status = status;
  await milestone.save();
  res.json(milestone);
});

const remove = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!milestone) throw new ApiError(404, 'Hito no encontrado');
  await milestone.destroy();
  res.status(204).send();
});

module.exports = { list, create, update, remove };
