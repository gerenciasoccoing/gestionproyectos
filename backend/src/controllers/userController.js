const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { User, Role, Project, ProjectUser } = require('../models');

const list = asyncHandler(async (req, res) => {
  const users = await User.findAll({
    include: [Role, { model: Project, attributes: ['id', 'name'] }],
    order: [['name', 'ASC']],
  });
  res.json(users.map(serializeUser));
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password, roleIds = [] } = req.body;
  if (!name || !email || !password) throw new ApiError(400, 'name, email y password son obligatorios');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash });
  if (roleIds.length) {
    const roles = await Role.findAll({ where: { id: roleIds } });
    await user.setRoles(roles);
  }
  const full = await User.findByPk(user.id, { include: [Role, Project] });
  res.status(201).json(serializeUser(full));
});

const update = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado');

  const { name, email, password, active, roleIds } = req.body;
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (active !== undefined) user.active = active;
  if (password) user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();

  if (roleIds !== undefined) {
    const roles = await Role.findAll({ where: { id: roleIds } });
    await user.setRoles(roles);
  }

  const full = await User.findByPk(user.id, { include: [Role, Project] });
  res.json(serializeUser(full));
});

const remove = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado');
  await user.destroy();
  res.status(204).send();
});

// Asigna (reemplaza) el conjunto de proyectos a los que un usuario tiene acceso.
const assignProjects = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado');
  const { projectIds = [] } = req.body;
  const projects = await Project.findAll({ where: { id: projectIds } });
  await user.setProjects(projects);
  const full = await User.findByPk(user.id, { include: [Role, Project] });
  res.json(serializeUser(full));
});

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active,
    roles: user.Roles.map((r) => ({ id: r.id, name: r.name })),
    projects: user.Projects.map((p) => ({ id: p.id, name: p.name })),
  };
}

module.exports = { list, create, update, remove, assignProjects };
