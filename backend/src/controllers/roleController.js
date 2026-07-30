const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Role, Permission } = require('../models');
const { MODULES, ACTIONS } = require('../config/permissions');

const listPermissionsCatalog = asyncHandler(async (req, res) => {
  res.json({ modules: MODULES, actions: ACTIONS });
});

const list = asyncHandler(async (req, res) => {
  const roles = await Role.findAll({ include: [Permission], order: [['name', 'ASC']] });
  res.json(roles.map(serializeRole));
});

const create = asyncHandler(async (req, res) => {
  const { name, description, permissionIds = [] } = req.body;
  if (!name) throw new ApiError(400, 'name es obligatorio');
  const role = await Role.create({ name, description });
  if (permissionIds.length) {
    const permissions = await Permission.findAll({ where: { id: permissionIds } });
    await role.setPermissions(permissions);
  }
  const full = await Role.findByPk(role.id, { include: [Permission] });
  res.status(201).json(serializeRole(full));
});

const update = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) throw new ApiError(404, 'Rol no encontrado');
  const { name, description, permissionIds } = req.body;
  if (name !== undefined) role.name = name;
  if (description !== undefined) role.description = description;
  await role.save();

  if (permissionIds !== undefined) {
    const permissions = await Permission.findAll({ where: { id: permissionIds } });
    await role.setPermissions(permissions);
  }
  const full = await Role.findByPk(role.id, { include: [Permission] });
  res.json(serializeRole(full));
});

const remove = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) throw new ApiError(404, 'Rol no encontrado');
  if (role.name === 'admin') throw new ApiError(400, 'No se puede eliminar el rol admin');
  await role.destroy();
  res.status(204).send();
});

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: role.Permissions.map((p) => ({ id: p.id, module: p.module, action: p.action })),
  };
}

module.exports = { list, create, update, remove, listPermissionsCatalog };
