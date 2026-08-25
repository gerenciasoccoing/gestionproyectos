const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Consortium, Project } = require('../models');
const { relativePath } = require('../middleware/upload');

const list = asyncHandler(async (req, res) => {
  const consortiums = await Consortium.findAll({ order: [['name', 'ASC']] });
  res.json(consortiums);
});

const get = asyncHandler(async (req, res) => {
  const consortium = await Consortium.findByPk(req.params.id);
  if (!consortium) throw new ApiError(404, 'Consorcio no encontrado');
  res.json(consortium);
});

const create = asyncHandler(async (req, res) => {
  const { name, nit, address, phone, legalRepName } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'El nombre es obligatorio');
  const consortium = await Consortium.create({
    name: name.trim(),
    nit,
    address,
    phone,
    legalRepName,
    logoPath: req.file ? relativePath(req.file) : null,
  });
  res.status(201).json(consortium);
});

const update = asyncHandler(async (req, res) => {
  const consortium = await Consortium.findByPk(req.params.id);
  if (!consortium) throw new ApiError(404, 'Consorcio no encontrado');
  const { name, nit, address, phone, legalRepName } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'El nombre es obligatorio');
    consortium.name = name.trim();
  }
  if (nit !== undefined) consortium.nit = nit;
  if (address !== undefined) consortium.address = address;
  if (phone !== undefined) consortium.phone = phone;
  if (legalRepName !== undefined) consortium.legalRepName = legalRepName;
  if (req.file) consortium.logoPath = relativePath(req.file);
  await consortium.save();
  res.json(consortium);
});

// No se puede borrar un consorcio con proyectos asociados: hay que reasignarlos (a otro consorcio
// o a la empresa principal) o advertirle al usuario cuáles son, en vez de dejar proyectos con un
// consortiumId huérfano que rompería la resolución de membrete.
const remove = asyncHandler(async (req, res) => {
  const consortium = await Consortium.findByPk(req.params.id);
  if (!consortium) throw new ApiError(404, 'Consorcio no encontrado');
  const projects = await Project.findAll({ where: { consortiumId: consortium.id }, attributes: ['id', 'name'] });
  if (projects.length > 0) {
    throw new ApiError(400, `No se puede eliminar: tiene ${projects.length} proyecto(s) asociado(s) (${projects.map((p) => p.name).join(', ')}). Reasigna esos proyectos antes de eliminar.`);
  }
  await consortium.destroy();
  res.status(204).send();
});

module.exports = { list, get, create, update, remove };
