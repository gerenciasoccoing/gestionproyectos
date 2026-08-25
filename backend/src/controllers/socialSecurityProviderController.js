const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { SocialSecurityProvider } = require('../models');

const TYPES = ['eps', 'pension', 'arl'];

// ?type=eps|pension|arl filtra el combo de la ficha del trabajador a la lista que corresponde;
// sin filtro, trae las tres (usado, por ejemplo, para mostrar el catálogo completo en un solo lugar).
const list = asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (type && !TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${TYPES.join(', ')}`);
  const providers = await SocialSecurityProvider.findAll({
    where: type ? { type } : {},
    order: [['type', 'ASC'], ['name', 'ASC']],
  });
  res.json(providers);
});

// "Agregar nueva entidad" desde el mismo combo del formulario del trabajador (ver
// SocialSecuritySelect en el frontend) — queda disponible de inmediato para el resto de la empresa.
const create = asyncHandler(async (req, res) => {
  const { type, name } = req.body;
  if (!TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${TYPES.join(', ')}`);
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');

  const [provider] = await SocialSecurityProvider.findOrCreate({ where: { type, name: name.trim() } });
  res.status(201).json(provider);
});

module.exports = { list, create };
