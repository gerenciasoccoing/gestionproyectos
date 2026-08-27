const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { User, Role, Project, ProjectUser } = require('../models');
const { assertWithinLimit } = require('../utils/planLimits');
const { invalidateAuthCache } = require('../middleware/auth');

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
  // Bug real en producción (admin@soccoing.com.co): sin este chequeo se podía guardar un usuario
  // sin ningún rol, lo que lo deja con un Set de permisos vacío (ver auth.js) y rompe la app entera
  // para esa persona apenas inicia sesión. Un usuario siempre debe quedar con al menos un rol.
  if (!roleIds.length) throw new ApiError(400, 'Debes asignar al menos un rol al usuario');

  await assertWithinLimit(User, 'maxUsers');

  const roles = await Role.findAll({ where: { id: roleIds } });
  if (roles.length !== roleIds.length) throw new ApiError(400, 'Uno o más roles seleccionados no existen');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash });
  await user.setRoles(roles);
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
    // Mismo requisito que en create(): un usuario nunca debe quedar sin ningún rol (ver comentario
    // ahí sobre el bug de admin@soccoing.com.co). Editar roles es justamente cómo se reasignan acá
    // (ver UsersPage.jsx), así que sin este chequeo el mismo bug podía reaparecer por esta vía.
    if (!roleIds.length) throw new ApiError(400, 'Debes asignar al menos un rol al usuario');
    const roles = await Role.findAll({ where: { id: roleIds } });
    if (roles.length !== roleIds.length) throw new ApiError(400, 'Uno o más roles seleccionados no existen');
    await user.setRoles(roles);
  }

  const full = await User.findByPk(user.id, { include: [Role, Project] });
  // El caché de auth.js guarda permisos/roles resueltos por hasta 45s (ver AUTH_CACHE_TTL_MS):
  // sin invalidar acá, un cambio de rol o de estado activo/inactivo tardaría hasta ese tiempo en
  // reflejarse para el usuario editado.
  invalidateAuthCache();
  res.json(serializeUser(full));
});

const remove = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new ApiError(404, 'Usuario no encontrado');
  await user.destroy();
  invalidateAuthCache();
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
  invalidateAuthCache();
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
