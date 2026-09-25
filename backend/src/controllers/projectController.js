const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Project, User, ProjectUser, Consortium } = require('../models');
const { deleteProjectCascade } = require('../services/projectDeletionService');
const { assertWithinLimit } = require('../utils/planLimits');
const { mapSeries } = require('../utils/mapSeries');
const { relativePath } = require('../middleware/upload');
const { hasAnyRole } = require('../middleware/authorize');
const { getProjectBudgetTotal } = require('../services/budgetService');
const { getProjectPaymentsSummary } = require('../services/projectPaymentsService');

// Longitud mínima de la observación obligatoria que el admin debe escribir para cerrar un proyecto
// con saldo real pendiente (ver update() más abajo).
const MIN_CLOSE_OBSERVATION_LENGTH = 10;

// Roles que pueden ver el valor total del contrato de cada proyecto en este listado (admin siempre
// puede, vía hasAnyRole). Para cualquier otro rol el campo contractValue directamente NO se incluye
// en la respuesta — no es solo un ocultamiento visual del frontend.
const CONTRACT_VALUE_ROLES = ['gerente_proyecto'];

const list = asyncHandler(async (req, res) => {
  const where = req.user.isAdmin ? {} : { id: req.user.projectIds };
  const projects = await Project.findAll({
    where,
    include: [
      { model: User, attributes: ['id', 'name', 'email'] },
      { model: Consortium, as: 'consortium', attributes: ['id', 'name'] },
      { model: User, as: 'closedByUser', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });

  if (!hasAnyRole(req.user, CONTRACT_VALUE_ROLES)) return res.json(projects);

  // mapSeries (no Promise.all): mismo patrón ya usado por thirdPartyController#getClientProjects
  // para el mismo cálculo por proyecto — comparten la transacción/conexión de la petición (RLS).
  const withValue = await mapSeries(projects, async (p) => {
    const json = p.toJSON();
    json.contractValue = await getProjectBudgetTotal(p.id);
    return json;
  });
  res.json(withValue);
});

const get = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.id, {
    include: [
      { model: User, attributes: ['id', 'name', 'email'] },
      { model: Consortium, as: 'consortium' },
      { model: User, as: 'closedByUser', attributes: ['id', 'name'] },
    ],
  });
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');
  // saldoReal/recoverablePending se agregan siempre (sin gateo por rol, a diferencia de
  // contractValue): los necesita el botón "Cerrar proyecto" para decidir su estado, visible para
  // cualquiera con acceso al proyecto — no son "el valor del contrato", solo un balance operativo.
  const { saldoReal, recoverablePending } = await getProjectPaymentsSummary(project.id);
  res.json({ ...project.toJSON(), saldoReal, recoverablePending });
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
  const { name, client, clientId, description, status, consortiumId, contractNumber, address } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'El nombre del proyecto es obligatorio');
    project.name = name;
  }
  if (client !== undefined) project.client = client;
  if (clientId !== undefined) project.clientId = clientId || null;
  if (description !== undefined) project.description = description;
  if (status !== undefined) {
    // Reabrir ('terminado' -> cualquier otro estado) queda reservado al rol 'admin' — es una
    // decisión de negocio más sensible que un usuario con permiso de edición no debería poder
    // tomar por su cuenta.
    if (project.status === 'terminado' && status !== 'terminado' && !req.user.isAdmin) {
      throw new ApiError(403, 'Solo un administrador puede reabrir un proyecto terminado');
    }
    // Cerrar (cualquier estado -> 'terminado'): exige que el saldo real (valor ejecutado - total
    // bruto reconocido en Pagos al proyecto, ver projectPaymentsService.js) esté en cero o a favor
    // del proyecto. Con saldo pendiente, un usuario sin el rol 'admin' no puede cerrar ni por acá
    // ni por la interfaz (que además deshabilita el botón); un admin sí puede, pero debe explicar
    // por qué con una observación de mínimo 10 caracteres — toda esta validación se hace en el
    // backend, la interfaz solo la anticipa para no hacer un viaje al servidor en vano.
    if (status === 'terminado' && project.status !== 'terminado') {
      // Las retenciones recuperables pendientes son solo informativas (ver tarea): nunca bloquean
      // el cierre, así que acá no hace falta leerlas — el frontend ya las muestra de antemano en
      // el modal de cierre a partir de GET /projects/:id/payments/summary.
      const { saldoReal } = await getProjectPaymentsSummary(project.id);
      if (saldoReal > 0) {
        if (!req.user.isAdmin) {
          throw new ApiError(403, `No se puede cerrar el proyecto: falta un saldo real de ${saldoReal.toLocaleString('es-CO')} por reconocer. Solo un administrador puede cerrarlo dejando una observación, o complétalo desde "Pagos al proyecto".`);
        }
        const observation = String(req.body.closeObservation || '').trim();
        if (observation.length < MIN_CLOSE_OBSERVATION_LENGTH) {
          throw new ApiError(400, `Debe explicar en una observación (mínimo ${MIN_CLOSE_OBSERVATION_LENGTH} caracteres) por qué se cierra el proyecto con saldo real pendiente de ${saldoReal.toLocaleString('es-CO')}.`);
        }
        project.closeObservation = observation;
      } else {
        project.closeObservation = null;
      }
      project.closeRealBalance = saldoReal;
      project.closedBy = req.user.id;
      project.closedAt = new Date();
    }
    project.status = status;
  }
  if (consortiumId !== undefined) project.consortiumId = consortiumId || null;
  // Edición explícita del No. de Contrato (a diferencia del auto-llenado de contractController.js,
  // este SÍ sobreescribe): es el gesto intencional para corregirlo en cualquier momento.
  if (contractNumber !== undefined) project.contractNumber = contractNumber ? contractNumber.trim() : null;
  if (address !== undefined) project.address = address ? address.trim() : null;
  await project.save();
  const full = await Project.findByPk(project.id, {
    include: [{ model: Consortium, as: 'consortium' }, { model: User, as: 'closedByUser', attributes: ['id', 'name'] }],
  });
  res.json(full);
});

// Foto de presentación del proyecto y mapa de ubicación (captura manual, sin geocodificación): dos
// campos de imagen independientes, cada uno reemplazable en cualquier momento. Usados en la
// portada del Informe para Cliente (ver reportEngineService.js / pdfService.js).
const uploadPresentationPhoto = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.id);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar una imagen');
  project.presentationPhotoPath = relativePath(req.file);
  await project.save();
  res.json(project);
});

const uploadLocationMap = asyncHandler(async (req, res) => {
  const project = await Project.findByPk(req.params.id);
  if (!project) throw new ApiError(404, 'Proyecto no encontrado');
  if (!req.file) throw new ApiError(400, 'Debe adjuntar una imagen');
  project.locationMapImagePath = relativePath(req.file);
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

module.exports = { list, get, create, update, remove, assignUsers, uploadPresentationPhoto, uploadLocationMap };
