const ApiError = require('../utils/ApiError');
const {
  sequelize, MaterialReturn, MaterialReturnLine, MaterialIssue, MaterialIssueLine, MaterialLot, Material, Warehouse, Project, MaterialMovementAudit,
} = require('../models');
const { nextMaterialReturnNumber } = require('./numberingService');
const { assertWarehouseUsable, restoreLotQuantity, createLotFromTransfer, decrementLotQuantity } = require('./materialLotService');

const RETURN_INCLUDE = [
  { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
  { model: Project, attributes: ['id', 'name', 'contractNumber', 'consortiumId'] },
  {
    model: MaterialReturnLine,
    as: 'lines',
    include: [
      { model: Material, attributes: ['id', 'name', 'unit'] },
      { model: MaterialIssueLine, as: 'originIssueLine', attributes: ['id', 'issueId'] },
    ],
  },
];

// Devuelve el material ya entregado por una Salida FIRMADA (no se puede devolver contra una salida
// pendiente o rechazada) — reparte `quantity` entre las líneas de esa salida para ese material, en
// el mismo orden en que se generaron (FIFO de líneas), respetando el tope de cada una (lo que esa
// línea entregó menos lo que ya se le devolvió, ver materialReturnService.js#returnedByIssueLine).
// El crédito va al MISMO lote si se devuelve a su misma bodega (restoreLotQuantity) o a un lote
// nuevo si se devuelve a otra (createLotFromTransfer con sourceType:'devolucion') — en ambos casos
// conserva el costo/OC de origen exactos, nunca se recalculan.
// reduce(), no Model.sum(): Model.sum()/.min()/.max() no disparan el hook 'beforeCount' que
// adjunta la transacción activa a la consulta (a diferencia de Model.count(), que sí) — bajo RLS
// (Capa 2) eso hace que la consulta corra sin el GUC app.current_company_id seteado y siempre
// devuelva null (0 filas visibles), aunque sí existan. Mismo criterio que ya usa
// purchaseOrderController.js#addReceipt (reduce sobre un findAll) para evitar exactamente este caso.
async function returnedByIssueLine(issueLineId, transaction) {
  const lines = await MaterialReturnLine.findAll({ where: { originIssueLineId: issueLineId }, transaction });
  return lines.reduce((sum, l) => sum + Number(l.quantity), 0);
}

async function createReturn({ originIssueId, toWarehouseId, date, materialId, quantity, userId }) {
  if (!originIssueId) throw new ApiError(400, 'originIssueId es obligatorio');
  if (!toWarehouseId) throw new ApiError(400, 'toWarehouseId es obligatorio');
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!materialId || !quantity || Number(quantity) <= 0) throw new ApiError(400, 'materialId y quantity (mayor a 0) son obligatorios');

  const issue = await MaterialIssue.findByPk(originIssueId);
  if (!issue) throw new ApiError(404, 'Salida no encontrada');
  if (issue.status !== 'firmado') throw new ApiError(400, 'Solo se puede devolver material de una salida ya firmada.');

  const materialReturn = await sequelize.transaction(async (t) => {
    await assertWarehouseUsable(toWarehouseId, { transaction: t });

    const issueLines = await MaterialIssueLine.findAll({
      where: { issueId: originIssueId, materialId }, order: [['createdAt', 'ASC']], transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!issueLines.length) throw new ApiError(400, 'Esta salida no entregó ese material.');

    const returnNumber = await nextMaterialReturnNumber(t);
    const created = await MaterialReturn.create({
      returnNumber, contractPrefix: issue.contractPrefix, toWarehouseId, date,
      projectId: issue.projectId, status: 'pendiente_firma', createdBy: userId,
    }, { transaction: t });
    // El vínculo a "contra qué salida" vive en cada línea (originIssueLineId → issueId), no en la
    // cabecera: así una devolución "contra un contrato" podrá, más adelante, abarcar líneas de más
    // de una salida sin cambiar el modelo.

    let remaining = Number(quantity);
    for (const line of issueLines) {
      if (remaining <= 0) break;
      // eslint-disable-next-line no-await-in-loop
      const already = await returnedByIssueLine(line.id, t);
      const capLeft = Number(line.quantity) - already;
      if (capLeft <= 0) continue;
      const take = Math.min(capLeft, remaining);

      // eslint-disable-next-line no-await-in-loop
      const sourceLot = await MaterialLot.findByPk(line.sourceLotId, { transaction: t });
      const destLot = sourceLot.warehouseId === toWarehouseId
        // eslint-disable-next-line no-await-in-loop
        ? await restoreLotQuantity(sourceLot.id, take, t)
        // eslint-disable-next-line no-await-in-loop
        : await createLotFromTransfer({ sourceLot, warehouseId: toWarehouseId, quantity: take, date, userId, transaction: t, sourceType: 'devolucion' });

      // eslint-disable-next-line no-await-in-loop
      await MaterialReturnLine.create({
        returnId: created.id, originIssueLineId: line.id, materialId, quantity: take,
        unitCost: line.unitCost, destinationLotId: destLot.id,
      }, { transaction: t });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new ApiError(400, `No se puede devolver más de lo entregado: quedan ${remaining} unidades sin poder devolver (ya se devolvió el máximo disponible de esta salida para este material).`);
    }

    return created;
  });

  return MaterialReturn.findByPk(materialReturn.id, { include: RETURN_INCLUDE });
}

async function markSigned(returnId) {
  const materialReturn = await MaterialReturn.findByPk(returnId);
  if (!materialReturn) throw new ApiError(404, 'Devolución no encontrada');
  if (materialReturn.status !== 'pendiente_firma') throw new ApiError(400, 'Esta devolución ya fue resuelta');
  materialReturn.status = 'firmado';
  await materialReturn.save();
  return materialReturn;
}

// No está descrito explícitamente en la especificación (las devoluciones no mencionan rechazo),
// pero se ofrece por consistencia con traslados/salidas y por seguridad del enlace público (que
// siempre expone la opción de rechazar) — deshace el crédito que esa devolución le había dado a
// cada lote destino. También es el camino para que un Administrador anule una devolución YA
// FIRMADA (ver MaterialMovementAudit.js) — `isAdminVoid` habilita el estado 'firmado', y el permiso
// de admin se valida en el controlador.
async function rejectReturn({ returnId, rejectionReason, userId, isAdminVoid = false }) {
  if (!rejectionReason || !rejectionReason.trim()) throw new ApiError(400, 'rejectionReason es obligatorio');
  const materialReturn = await MaterialReturn.findByPk(returnId, { include: [{ model: MaterialReturnLine, as: 'lines' }] });
  if (!materialReturn) throw new ApiError(404, 'Devolución no encontrada');
  const allowedStatuses = isAdminVoid ? ['pendiente_firma', 'firmado'] : ['pendiente_firma'];
  if (!allowedStatuses.includes(materialReturn.status)) throw new ApiError(400, 'Esta devolución ya fue resuelta');
  const wasSigned = materialReturn.status === 'firmado';

  await sequelize.transaction(async (t) => {
    for (const line of materialReturn.lines) {
      // eslint-disable-next-line no-await-in-loop
      await decrementLotQuantity(line.destinationLotId, line.quantity, t);
    }
    materialReturn.status = 'rechazado';
    materialReturn.rejectionReason = rejectionReason.trim();
    await materialReturn.save({ transaction: t });
    if (wasSigned) {
      await MaterialMovementAudit.create({
        movementType: 'devolucion', movementId: materialReturn.id, action: 'voided_after_signature', observation: rejectionReason.trim(), userId,
      }, { transaction: t });
    }
  });

  return MaterialReturn.findByPk(materialReturn.id, { include: RETURN_INCLUDE });
}

async function listReturns(where) {
  return MaterialReturn.findAll({ where, include: RETURN_INCLUDE, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
}

async function getReturn(id) {
  return MaterialReturn.findByPk(id, { include: RETURN_INCLUDE });
}

// Cuánto queda devolvible de un material en una salida (para que el formulario sugiera el tope) —
// suma de líneas de esa salida para ese material, menos lo ya devuelto de cada una.
async function getReturnableForIssue(issueId) {
  const lines = await MaterialIssueLine.findAll({ where: { issueId }, include: [{ model: Material, attributes: ['id', 'name', 'unit'] }] });
  const byMaterial = new Map();
  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const already = await returnedByIssueLine(line.id);
    const entry = byMaterial.get(line.materialId) || { materialId: line.materialId, materialName: line.Material?.name, unit: line.Material?.unit, delivered: 0, returned: 0 };
    entry.delivered += Number(line.quantity);
    entry.returned += already;
    byMaterial.set(line.materialId, entry);
  }
  return [...byMaterial.values()].map((e) => ({ ...e, returnable: e.delivered - e.returned }));
}

module.exports = { createReturn, markSigned, rejectReturn, listReturns, getReturn, getReturnableForIssue, RETURN_INCLUDE };
