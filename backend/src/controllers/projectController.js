const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Project, User, ProjectUser, Consortium } = require('../models');
const { deleteProjectCascade } = require('../services/projectDeletionService');
const { assertWithinLimit } = require('../utils/planLimits');
const { mapSeries } = require('../utils/mapSeries');

const list = asyncHandler(async (req, res) => {
  const where = req.user.isAdmin ? {} : { id: req.user.projectIds };
  const projects = await Project.findAll({
    where,
    include: [{ model: User, attributes: ['id', 'name', 'email'] }, { model: Consortium, as: 'consortium', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(projects);
});

const get = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.id, {
    include: [{ model: User, attributes: ['id', 'name', 'email'] }, { model: Consortium, as: 'consortium' }],
  });
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');
  res.json(project);
});

const create = asyncHandler(async (req, res) => {
  const { name, client, clientId, description, userIds = [], consortiumId } = req.body;
  if (!name) throw new ApiError(400, 'El nombre del proyecto es obligatorio');

  await assertWithinLimit(Project, 'maxActiveProjects', { status: 'activo' });

  const project = await Project.create({
    name, client, clientId: clientId || null, description, origin: 'manual', createdBy: req.user.id,
    consortiumId: consortiumId || null,
  });

  const assignees = new Set([req.user.id, ...userIds]);
  await mapSeries([...assignees], (userId) => ProjectUser.create({ userId, projectId: project.id }));

  const full = await Project.findByPk(project.id, { include: [User] });
  res.status(201).json(full);
});

const update = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.id);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');
  const { name, client, clientId, description, status, consortiumId, contractNumber } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'El nombre del proyecto es obligatorio');
    project.name = name;
  }
  if (client !== undefined) project.client = client;
  if (clientId !== undefined) project.clientId = clientId || null;
  if (description !== undefined) project.description = description;
  if (status !== undefined) project.status = status;
  if (consortiumId !== undefined) project.consortiumId = consortiumId || null;
  // Edición explícita del No. de Contrato (a diferencia del auto-llenado de contractController.js,
  // este SÍ sobreescribe): es el gesto intencional para corregirlo en cualquier momento.
  if (contractNumber !== undefined) project.contractNumber = contractNumber ? contractNumber.trim() : null;
  await project.save();
  res.json(project);
});

const remove = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.id);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');
  await deleteProjectCascade(project.id);
  res.status(204).send();
});

const assignUsers = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.id);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');
  const { userIds = [] } = req.body;
  const users = await User.findAll({ where: { id: userIds } });
  await project.setUsers(users);
  const full = await Project.findByPk(project.id, { include: [User] });
  res.json(full);
});

module.exports = { list, get, create, update, remove, assignUsers };
