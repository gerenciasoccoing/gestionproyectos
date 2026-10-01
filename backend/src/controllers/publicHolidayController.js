// Calendario de festivos de Colombia (Administración > Parámetros) — sembrado automáticamente
// (ver config/colombianHolidays.js), pero editable: si algún año la norma cambia un festivo, se
// ajusta acá sin tocar código. Usado por laborCalculations.js#countBusinessDays para el saldo de
// vacaciones.
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { PublicHoliday } = require('../models');

const list = asyncHandler(async (req, res) => {
  const { year } = req.query;
  const holidays = await PublicHoliday.findAll({ order: [['date', 'ASC']] });
  res.json(year ? holidays.filter((h) => h.date.startsWith(String(year))) : holidays);
});

const create = asyncHandler(async (req, res) => {
  const { date, name } = req.body;
  if (!date || !name || !name.trim()) throw new ApiError(400, 'date y name son obligatorios');
  const holiday = await PublicHoliday.create({ date, name: name.trim() });
  res.status(201).json(holiday);
});

const update = asyncHandler(async (req, res) => {
  const holiday = await PublicHoliday.findByPk(req.params.id);
  if (!holiday) throw new ApiError(404, 'Festivo no encontrado');
  const { date, name } = req.body;
  if (date !== undefined) holiday.date = date;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    holiday.name = name.trim();
  }
  await holiday.save();
  res.json(holiday);
});

const remove = asyncHandler(async (req, res) => {
  const holiday = await PublicHoliday.findByPk(req.params.id);
  if (!holiday) throw new ApiError(404, 'Festivo no encontrado');
  await holiday.destroy();
  res.status(204).send();
});

module.exports = { list, create, update, remove };
