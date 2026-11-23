const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Warehouse, User } = require('../models');
const { getWarehouseStock } = require('../services/warehouseService');

// Sin requirePermission en GET a propósito (mismo criterio que adminExpenseCategoryController.js):
// la bodega se necesita como selector en formularios de entradas/traslados/salidas de muchos roles
// distintos, no solo de quien administra bodegas.
const list = asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.findAll({
    include: [{ model: User, as: 'manager', attributes: ['id', 'name'] }],
    order: [['isDefault', 'DESC'], ['name', 'ASC']],
  });
  res.json(warehouses);
});

const get = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id, {
    include: [{ model: User, as: 'manager', attributes: ['id', 'name'] }],
  });
  if (!warehouse) throw new ApiError(404, 'Bodega no encontrada');
  const stock = await getWarehouseStock(warehouse.id);
  res.json({ ...warehouse.toJSON(), stock });
});

const create = asyncHandler(async (req, res) => {
  const { name, location, managerUserId, managerName, managerPhone, managerEmail } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  // isDefault nunca viaja por el body: solo lo asigna companyProvisioningService.js/postSyncFixups.js
  // al crear "Bodega Principal" — cualquier otra bodega nace isDefault:false.
  const warehouse = await Warehouse.create({
    name: name.trim(), location: location || null,
    managerUserId: managerUserId || null, managerName: managerName || null,
    managerPhone: managerPhone || null, managerEmail: managerEmail || null,
  });
  res.status(201).json(warehouse);
});

const update = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) throw new ApiError(404, 'Bodega no encontrada');
  const { name, location, managerUserId, managerName, managerPhone, managerEmail, active } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    warehouse.name = name.trim();
  }
  if (location !== undefined) warehouse.location = location || null;
  if (managerUserId !== undefined) warehouse.managerUserId = managerUserId || null;
  if (managerName !== undefined) warehouse.managerName = managerName || null;
  if (managerPhone !== undefined) warehouse.managerPhone = managerPhone || null;
  if (managerEmail !== undefined) warehouse.managerEmail = managerEmail || null;
  if (active !== undefined) {
    if (warehouse.isDefault && active === false) throw new ApiError(400, 'La Bodega Principal no se puede desactivar');
    warehouse.active = active;
  }
  await warehouse.save();
  res.json(warehouse);
});

// No hay DELETE a propósito (mismo criterio que CashBox: nunca se expone eliminar, solo
// activar/desactivar vía update's `active`) — una bodega con historial de lotes/movimientos no se
// puede borrar sin romper el kardex ni dejar lotes huérfanos (violaría la FK de MaterialLot.warehouseId).
// "Terminado" aquí es "inactiva": conserva todo su historial, deja de poder elegirse en formularios
// nuevos (ver materialLotService.js#assertWarehouseUsable, Fase 2).

module.exports = { list, get, create, update };
