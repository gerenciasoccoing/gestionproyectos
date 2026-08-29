const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Contract, Project } = require('../models');
const { relativePath } = require('../middleware/upload');

const list = asyncHandler(async (req, res) => {
  const contracts = await Contract.findAll({ where: { projectId: req.params.projectId }, order: [['signedDate', 'DESC']] });
  res.json(contracts);
});

const create = asyncHandler(async (req, res) => {
  const { object, value, signedDate, endDate, contractNumber } = req.body;
  if (!object || value === undefined || !signedDate || !endDate) {
    throw new ApiError(400, 'object, value, signedDate y endDate son obligatorios');
  }
  if (Number(value) < 0) throw new ApiError(400, 'El valor no puede ser negativo');
  if (new Date(endDate) < new Date(signedDate)) {
    throw new ApiError(400, 'La fecha de terminación no puede ser anterior a la fecha de firma');
  }

  const contract = await Contract.create({
    projectId: req.params.projectId,
    object,
    value,
    signedDate,
    endDate,
    filePath: relativePath(req.file),
  });

  // El No. de Contrato del proyecto se define UNA sola vez desde este formulario (leído
  // automáticamente al escanear el PDF, o digitado a mano) — si el proyecto ya tenía uno
  // asignado, no se sobreescribe acá; para corregirlo después se usa la edición explícita en la
  // cabecera de la sección (projectController.update), un gesto intencional en vez de un efecto
  // secundario de subir otro contrato.
  if (contractNumber && contractNumber.trim()) {
    const project = await Project.findByPk(req.params.projectId);
    if (project && !project.contractNumber) {
      project.contractNumber = contractNumber.trim();
      await project.save();
    }
  }

  res.status(201).json(contract);
});

const update = asyncHandler(async (req, res) => {
  const contract = await Contract.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!contract) throw new ApiError(404, 'Contrato no encontrado');

  const { object, value, signedDate, endDate } = req.body;
  const nextSignedDate = signedDate ?? contract.signedDate;
  const nextEndDate = endDate ?? contract.endDate;
  if (new Date(nextEndDate) < new Date(nextSignedDate)) {
    throw new ApiError(400, 'La fecha de terminación no puede ser anterior a la fecha de firma');
  }
  if (value !== undefined && Number(value) < 0) throw new ApiError(400, 'El valor no puede ser negativo');

  if (object !== undefined) contract.object = object;
  if (value !== undefined) contract.value = value;
  if (signedDate !== undefined) contract.signedDate = signedDate;
  if (endDate !== undefined) contract.endDate = endDate;
  if (req.file) contract.filePath = relativePath(req.file);
  await contract.save();
  res.json(contract);
});

const remove = asyncHandler(async (req, res) => {
  const contract = await Contract.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!contract) throw new ApiError(404, 'Contrato no encontrado');
  await contract.destroy();
  res.status(204).send();
});

module.exports = { list, create, update, remove };
