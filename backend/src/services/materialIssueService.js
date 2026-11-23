const ApiError = require('../utils/ApiError');
const { sequelize, MaterialIssue, MaterialIssueLine, MaterialLot, Material, Warehouse, Project, Employee, MaterialMovementAudit } = require('../models');
const { nextMaterialIssueNumber, contractPrefixForProject } = require('./numberingService');
const { assertWarehouseUsable, consumeLotsPeps, restoreLotQuantity } = require('./materialLotService');

const ISSUE_INCLUDE = [
  { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] },
  { model: Project, attributes: ['id', 'name', 'contractNumber', 'consortiumId'] },
  { model: Employee, as: 'receiverEmployee', attributes: ['id', 'name'] },
  {
    model: MaterialIssueLine,
    as: 'lines',
    include: [
      { model: Material, attributes: ['id', 'name', 'unit'] },
      { model: MaterialLot, as: 'sourceLot', attributes: ['id', 'purchaseOrderId', 'receivedDate', 'unitCost'] },
    ],
  },
];

// Registra la salida: valida destino (un proyecto activo, no Terminado, O un texto libre — nunca
// los dos) y receptor (un trabajador de Personal, o una persona externa con al menos su nombre),
// descuenta de inmediato los lotes de origen (PEPS o a mano, igual que un traslado) y asigna el
// consecutivo con el prefijo del contrato del proyecto destino (null si "Otro destino").
async function createIssue({
  fromWarehouseId, date, projectId, freeTextDestination, receiverType,
  receiverEmployeeId, receiverExternalName, receiverExternalCedula, receiverExternalPhone, receiverExternalEmail,
  lines, userId,
}) {
  if (!fromWarehouseId) throw new ApiError(400, 'fromWarehouseId es obligatorio');
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!Array.isArray(lines) || lines.length === 0) throw new ApiError(400, 'Debe incluir al menos un ítem');

  const hasProject = Boolean(projectId);
  const hasFreeText = Boolean(freeTextDestination && freeTextDestination.trim());
  if (hasProject === hasFreeText) {
    throw new ApiError(400, 'Debe elegir exactamente un destino: un proyecto de la lista, o "Otro destino" con un texto.');
  }
  let project = null;
  if (hasProject) {
    project = await Project.findByPk(projectId);
    if (!project) throw new ApiError(400, 'Proyecto no encontrado');
    if (project.status === 'terminado') throw new ApiError(400, 'No se permiten salidas hacia un proyecto en estado Terminado.');
  }

  if (receiverType === 'empleado') {
    if (!receiverEmployeeId) throw new ApiError(400, 'receiverEmployeeId es obligatorio cuando receiverType es "empleado"');
  } else if (receiverType === 'externo') {
    if (!receiverExternalName || !receiverExternalName.trim()) throw new ApiError(400, 'El nombre de la persona externa es obligatorio');
  } else {
    throw new ApiError(400, 'receiverType debe ser "empleado" o "externo"');
  }

  const issue = await sequelize.transaction(async (t) => {
    await assertWarehouseUsable(fromWarehouseId, { transaction: t });

    const issueNumber = await nextMaterialIssueNumber(t);
    const contractPrefix = hasProject ? await contractPrefixForProject(projectId, t) : null;
    const created = await MaterialIssue.create({
      issueNumber, contractPrefix, fromWarehouseId, date,
      projectId: hasProject ? projectId : null,
      freeTextDestination: hasFreeText ? freeTextDestination.trim() : null,
      receiverType,
      receiverEmployeeId: receiverType === 'empleado' ? receiverEmployeeId : null,
      receiverExternalName: receiverType === 'externo' ? receiverExternalName.trim() : null,
      receiverExternalCedula: receiverType === 'externo' ? (receiverExternalCedula || null) : null,
      receiverExternalPhone: receiverType === 'externo' ? (receiverExternalPhone || null) : null,
      receiverExternalEmail: receiverType === 'externo' ? (receiverExternalEmail || null) : null,
      status: 'pendiente_firma',
      createdBy: userId,
    }, { transaction: t });

    for (const line of lines) {
      if (!line.materialId || line.quantity === undefined || Number(line.quantity) <= 0) {
        throw new ApiError(400, 'Cada ítem requiere materialId y quantity mayor a 0');
      }
      // eslint-disable-next-line no-await-in-loop
      const consumed = await consumeLotsPeps({
        warehouseId: fromWarehouseId, materialId: line.materialId, quantity: line.quantity,
        manualLotId: line.lotId || null, transaction: t,
      });
      for (const c of consumed) {
        // eslint-disable-next-line no-await-in-loop
        await MaterialIssueLine.create({
          issueId: created.id, materialId: line.materialId, sourceLotId: c.lotId,
          quantity: c.quantity, unitCost: c.unitCost,
          salePriceUnit: line.salePriceUnit !== undefined && line.salePriceUnit !== '' ? line.salePriceUnit : null,
        }, { transaction: t });
      }
    }

    return created;
  });

  return MaterialIssue.findByPk(issue.id, { include: ISSUE_INCLUDE });
}

// Marca la salida como firmada — el stock YA se descontó al crearla, firmar no vuelve a tocarlo
// (a diferencia de un traslado, acá no hay bodega destino: firmar solo certifica la entrega). Se
// llama desde materialSignatureService (en-app o enlace público) después de registrar la firma.
async function markSigned(issueId) {
  const issue = await MaterialIssue.findByPk(issueId);
  if (!issue) throw new ApiError(404, 'Salida no encontrada');
  if (issue.status !== 'pendiente_firma') throw new ApiError(400, 'Esta salida ya fue resuelta');
  issue.status = 'firmado';
  await issue.save();
  return issue;
}

// Rechaza la salida: el material vuelve íntegro a los mismos lotes de origen. También es el camino
// para que un Administrador "elimine" una salida YA FIRMADA (ver la especificación: "editar o
// eliminar movimientos ya firmados es solo para Administrador, con observación obligatoria y
// registro de auditoría") — el permiso de admin se valida en el controlador, acá solo se exige
// `isAdminVoid` para permitir el estado 'firmado' y se deja el registro de auditoría. La reversa de
// stock es exactamente la misma (restoreLotQuantity ya bloquea si ese stock se volvió a consumir).
async function rejectIssue({ issueId, rejectionReason, userId, isAdminVoid = false }) {
  if (!rejectionReason || !rejectionReason.trim()) throw new ApiError(400, 'rejectionReason es obligatorio');
  const issue = await MaterialIssue.findByPk(issueId, { include: [{ model: MaterialIssueLine, as: 'lines' }] });
  if (!issue) throw new ApiError(404, 'Salida no encontrada');
  const allowedStatuses = isAdminVoid ? ['pendiente_firma', 'firmado'] : ['pendiente_firma'];
  if (!allowedStatuses.includes(issue.status)) throw new ApiError(400, 'Esta salida ya fue resuelta');
  const wasSigned = issue.status === 'firmado';

  await sequelize.transaction(async (t) => {
    for (const line of issue.lines) {
      // eslint-disable-next-line no-await-in-loop
      await restoreLotQuantity(line.sourceLotId, line.quantity, t);
    }
    issue.status = 'rechazado';
    issue.rejectionReason = rejectionReason.trim();
    await issue.save({ transaction: t });
    if (wasSigned) {
      await MaterialMovementAudit.create({
        movementType: 'salida', movementId: issue.id, action: 'voided_after_signature', observation: rejectionReason.trim(), userId,
      }, { transaction: t });
    }
  });

  return MaterialIssue.findByPk(issue.id, { include: ISSUE_INCLUDE });
}

async function listIssues(where) {
  return MaterialIssue.findAll({ where, include: ISSUE_INCLUDE, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
}

async function getIssue(id) {
  return MaterialIssue.findByPk(id, { include: ISSUE_INCLUDE });
}

module.exports = { createIssue, markSigned, rejectIssue, listIssues, getIssue, ISSUE_INCLUDE };
