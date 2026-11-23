const ApiError = require('../utils/ApiError');
const { sequelize, MaterialTransfer, MaterialTransferLine, MaterialLot, Material, Warehouse, MaterialMovementAudit } = require('../models');
const { nextTransferNumber } = require('./numberingService');
const { assertWarehouseUsable, consumeLotsPeps, restoreLotQuantity, createLotFromTransfer, decrementLotQuantity } = require('./materialLotService');

const TRANSFER_INCLUDE = [
  { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] },
  { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
  {
    model: MaterialTransferLine,
    as: 'lines',
    include: [
      { model: Material, attributes: ['id', 'name', 'unit'] },
      { model: MaterialLot, as: 'sourceLot', attributes: ['id', 'purchaseOrderId', 'receivedDate', 'unitCost'] },
    ],
  },
];

// Registra un traslado: descuenta DE INMEDIATO los lotes de origen (PEPS o lote elegido a mano por
// línea, ver materialLotService.js#consumeLotsPeps) — el material "sale" aunque todavía no esté
// disponible en destino (status 'en_transito'). Si un ítem necesita varios lotes para completar la
// cantidad, consumeLotsPeps ya devuelve una línea por lote con su costo exacto.
async function createTransfer({ fromWarehouseId, toWarehouseId, date, lines, observations, userId }) {
  if (!fromWarehouseId || !toWarehouseId) throw new ApiError(400, 'fromWarehouseId y toWarehouseId son obligatorios');
  if (fromWarehouseId === toWarehouseId) throw new ApiError(400, 'La bodega de origen y destino no pueden ser la misma');
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!Array.isArray(lines) || lines.length === 0) throw new ApiError(400, 'Debe incluir al menos un ítem');

  const transfer = await sequelize.transaction(async (t) => {
    await assertWarehouseUsable(fromWarehouseId, { transaction: t });
    await assertWarehouseUsable(toWarehouseId, { transaction: t });

    const transferNumber = await nextTransferNumber(t);
    const created = await MaterialTransfer.create({
      transferNumber, fromWarehouseId, toWarehouseId, date,
      status: 'en_transito', observations: observations || null, createdBy: userId,
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
        await MaterialTransferLine.create({
          transferId: created.id, materialId: line.materialId, sourceLotId: c.lotId,
          quantitySent: c.quantity, unitCost: c.unitCost,
        }, { transaction: t });
      }
    }

    return created;
  });

  return MaterialTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
}

// Confirma la recepción: crea (o no, si la línea llegó en 0) un lote nuevo en la bodega destino por
// cada línea, con la cantidad REALMENTE recibida — nunca más de lo enviado. Si alguna línea llegó
// incompleta, exige una observación del faltante (la diferencia queda como merma, no se devuelve
// sola a origen: eso solo pasa si se rechaza el traslado COMPLETO, ver rejectTransfer).
// receivedByLine: Map/objeto { [lineId]: quantityReceived } — una línea ausente se asume recibida
// completa (comportamiento por defecto: "confirmar tal cual se envió").
async function confirmTransfer({ transferId, receivedByLine = {}, shortageObservation, userId }) {
  const transfer = await MaterialTransfer.findByPk(transferId, { include: [{ model: MaterialTransferLine, as: 'lines' }] });
  if (!transfer) throw new ApiError(404, 'Traslado no encontrado');
  if (transfer.status !== 'en_transito') throw new ApiError(400, 'Este traslado ya fue resuelto');

  let hasShortage = false;
  await sequelize.transaction(async (t) => {
    for (const line of transfer.lines) {
      const raw = receivedByLine[line.id];
      const qtyReceived = raw === undefined || raw === null || raw === '' ? Number(line.quantitySent) : Number(raw);
      if (Number.isNaN(qtyReceived) || qtyReceived < 0 || qtyReceived > Number(line.quantitySent)) {
        throw new ApiError(400, `La cantidad recibida no puede ser negativa ni mayor a lo enviado (${line.quantitySent})`);
      }
      if (qtyReceived < Number(line.quantitySent)) hasShortage = true;

      if (qtyReceived > 0) {
        // eslint-disable-next-line no-await-in-loop
        const sourceLot = await MaterialLot.findByPk(line.sourceLotId, { transaction: t });
        // eslint-disable-next-line no-await-in-loop
        const destLot = await createLotFromTransfer({
          sourceLot, warehouseId: transfer.toWarehouseId, quantity: qtyReceived, date: transfer.date, userId, transaction: t,
        });
        line.destinationLotId = destLot.id;
      }
      line.quantityReceived = qtyReceived;
      // eslint-disable-next-line no-await-in-loop
      await line.save({ transaction: t });
    }

    if (hasShortage && !(shortageObservation || '').trim()) {
      throw new ApiError(400, 'Se recibió menos de lo enviado en al menos un ítem: la observación del faltante es obligatoria.');
    }

    transfer.status = 'confirmado';
    transfer.shortageObservation = hasShortage ? shortageObservation.trim() : null;
    transfer.confirmedBy = userId;
    transfer.confirmedAt = new Date();
    await transfer.save({ transaction: t });
  });

  return MaterialTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
}

// Rechaza el traslado: TODO el material vuelve íntegro a los mismos lotes de origen (a diferencia
// de un faltante en la confirmación, acá no hay merma posible: nada llegó a ningún lado).
async function rejectTransfer({ transferId, rejectionReason, userId }) {
  if (!rejectionReason || !rejectionReason.trim()) throw new ApiError(400, 'rejectionReason es obligatorio');
  const transfer = await MaterialTransfer.findByPk(transferId, { include: [{ model: MaterialTransferLine, as: 'lines' }] });
  if (!transfer) throw new ApiError(404, 'Traslado no encontrado');
  if (transfer.status !== 'en_transito') throw new ApiError(400, 'Este traslado ya fue resuelto');

  await sequelize.transaction(async (t) => {
    for (const line of transfer.lines) {
      // eslint-disable-next-line no-await-in-loop
      await restoreLotQuantity(line.sourceLotId, line.quantitySent, t);
    }
    transfer.status = 'rechazado';
    transfer.rejectionReason = rejectionReason.trim();
    transfer.confirmedBy = userId;
    transfer.confirmedAt = new Date();
    await transfer.save({ transaction: t });
  });

  return MaterialTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
}

// Anula un traslado YA CONFIRMADO (solo Administrador, con observación obligatoria — ver
// MaterialMovementAudit.js). A diferencia de rejectTransfer (que corre sobre un traslado todavía
// 'en_transito', donde nada llegó a destino), un traslado confirmado tiene efecto EN DOS BODEGAS:
// hay que descontar primero lo que quedó acreditado en destino (cada línea.destinationLotId por su
// quantityReceived) y luego devolver a origen lo que se había descontado al enviar (cada
// línea.sourceLotId por su quantitySent) — por eso no puede reusar rejectTransfer tal cual.
async function voidConfirmedTransfer({ transferId, observation, userId }) {
  if (!observation || !observation.trim()) throw new ApiError(400, 'observation es obligatoria');
  const transfer = await MaterialTransfer.findByPk(transferId, { include: [{ model: MaterialTransferLine, as: 'lines' }] });
  if (!transfer) throw new ApiError(404, 'Traslado no encontrado');
  if (transfer.status !== 'confirmado') throw new ApiError(400, 'Solo se puede anular un traslado ya confirmado.');

  await sequelize.transaction(async (t) => {
    for (const line of transfer.lines) {
      if (line.destinationLotId && Number(line.quantityReceived) > 0) {
        // eslint-disable-next-line no-await-in-loop
        await decrementLotQuantity(line.destinationLotId, line.quantityReceived, t);
      }
      // eslint-disable-next-line no-await-in-loop
      await restoreLotQuantity(line.sourceLotId, line.quantitySent, t);
    }
    transfer.status = 'rechazado';
    transfer.rejectionReason = observation.trim();
    await transfer.save({ transaction: t });
    await MaterialMovementAudit.create({
      movementType: 'traslado', movementId: transfer.id, action: 'voided_after_signature', observation: observation.trim(), userId,
    }, { transaction: t });
  });

  return MaterialTransfer.findByPk(transfer.id, { include: TRANSFER_INCLUDE });
}

async function listTransfers(where) {
  return MaterialTransfer.findAll({ where, include: TRANSFER_INCLUDE, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
}

async function getTransfer(id) {
  return MaterialTransfer.findByPk(id, { include: TRANSFER_INCLUDE });
}

module.exports = { createTransfer, confirmTransfer, rejectTransfer, voidConfirmedTransfer, listTransfers, getTransfer, TRANSFER_INCLUDE };
