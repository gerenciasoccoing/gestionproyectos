const ApiError = require('../utils/ApiError');
const { sequelize, CashBoxMovement, CashBoxMovementWithholding, WithholdingType } = require('../models');

// Redondeo a pesos (sin centavos, criterio del negocio para este dinero) evitando el error clásico
// de coma flotante de JS (0.1+0.2): siempre se calcula sobre el valor YA multiplicado por 100
// (nunca se sigue operando en punto flotante después del redondeo). Mismo criterio que
// budgetService.computeVatAmount, aplicado acá también a los montos brutos/netos, no solo al %.
function roundPesos(n) {
  return Math.round(Number(n) || 0);
}

// Valida y resuelve una fila de retención del body: base por defecto = grossAmount (editable),
// percent por defecto = el % del tipo elegido (editable), value se sugiere como base*percent/100
// pero SIEMPRE se respeta lo que mande el usuario si lo trae (ajuste manual de redondeo, ver
// tarea). withholdingType puede ser null si el usuario no asoció un tipo del catálogo (fila libre).
function resolveWithholdingRow(raw, grossAmount, withholdingTypesById) {
  const withholdingTypeId = raw.withholdingTypeId || null;
  const type = withholdingTypeId ? withholdingTypesById.get(withholdingTypeId) : null;
  if (withholdingTypeId && !type) throw new ApiError(400, 'Tipo de retención no encontrado');

  const typeName = raw.typeName || type?.name;
  if (!typeName || !String(typeName).trim()) throw new ApiError(400, 'Cada retención debe tener un tipo/nombre');

  const base = raw.base !== undefined && raw.base !== '' ? Number(raw.base) : Number(grossAmount);
  if (Number.isNaN(base) || base < 0) throw new ApiError(400, 'La base de la retención no puede ser negativa');
  const percent = raw.percent !== undefined && raw.percent !== '' ? Number(raw.percent) : Number(type?.defaultPercent || 0);
  if (Number.isNaN(percent) || percent < 0 || percent > 100) throw new ApiError(400, 'El % de retención debe estar entre 0 y 100');
  const value = raw.value !== undefined && raw.value !== '' ? roundPesos(raw.value) : roundPesos((base * percent) / 100);
  if (value < 0) throw new ApiError(400, 'El valor de la retención no puede ser negativo');

  return {
    withholdingTypeId,
    typeName: String(typeName).trim(),
    base: roundPesos(base),
    percent,
    value,
    recoverable: raw.recoverable !== undefined ? Boolean(raw.recoverable) : Boolean(type?.recoverable),
  };
}

// Resuelve todos los campos calculados de un ingreso (bruto/retenciones/neto) a partir del body
// crudo, sin tocar la base de datos — compartido por createMovement y updateMovement para que las
// dos vías se comporten siempre igual. Devuelve también las filas de retención ya resueltas, listas
// para crear.
async function resolveMovementFinancials(body) {
  const { projectId, amount, grossAmount, withholdings, isWithholdingReturn } = body;

  if (!projectId) {
    // Mismo comportamiento de siempre: monto, fecha y concepto, sin bruto/retenciones/devolución.
    if (amount === undefined || Number(amount) <= 0) throw new ApiError(400, 'amount es obligatorio y debe ser mayor a 0');
    return { projectId: null, amount: roundPesos(amount), grossAmount: roundPesos(amount), withholdingRows: [], isWithholdingReturn: false, returnsWithholdingId: null };
  }

  if (isWithholdingReturn) {
    const value = amount !== undefined ? Number(amount) : Number(grossAmount);
    if (!value || value <= 0) throw new ApiError(400, 'El valor de la devolución debe ser mayor a 0');
    if (!body.returnsWithholdingId) throw new ApiError(400, 'Debe seleccionar la retención que se está devolviendo');
    return { projectId, amount: roundPesos(value), grossAmount: roundPesos(value), withholdingRows: [], isWithholdingReturn: true, returnsWithholdingId: body.returnsWithholdingId };
  }

  if (grossAmount === undefined || Number(grossAmount) <= 0) throw new ApiError(400, 'grossAmount es obligatorio y debe ser mayor a 0');
  const gross = roundPesos(grossAmount);

  const withholdingTypeIds = (withholdings || []).map((w) => w.withholdingTypeId).filter(Boolean);
  const types = withholdingTypeIds.length ? await WithholdingType.findAll({ where: { id: withholdingTypeIds } }) : [];
  const withholdingTypesById = new Map(types.map((t) => [t.id, t]));

  const withholdingRows = (withholdings || []).map((w) => resolveWithholdingRow(w, gross, withholdingTypesById));
  const totalWithholdings = withholdingRows.reduce((sum, w) => sum + w.value, 0);
  if (totalWithholdings > gross) {
    throw new ApiError(400, 'El total de retenciones no puede ser mayor que el valor bruto del pago');
  }
  const net = gross - totalWithholdings;

  return { projectId, amount: net, grossAmount: gross, withholdingRows, isWithholdingReturn: false, returnsWithholdingId: null };
}

// Si el ingreso que se está creando/editando es una devolución de retención (isWithholdingReturn),
// valida que la retención elegida exista, sea recuperable, pertenezca a un pago del MISMO proyecto
// y no esté ya devuelta — y la marca como devuelta apuntando a este movimiento. excludeMovementId
// se usa al editar (para no chocar consigo misma si ya era la devolución de esa retención).
async function applyWithholdingReturn({ returnsWithholdingId, projectId, movementId, transaction }) {
  const withholding = await CashBoxMovementWithholding.findByPk(returnsWithholdingId, {
    include: [{ model: CashBoxMovement, as: 'movement' }],
    transaction,
  });
  if (!withholding) throw new ApiError(404, 'La retención seleccionada para devolución no existe');
  if (!withholding.recoverable) throw new ApiError(400, 'Esa retención no está marcada como recuperable');
  if (withholding.movement?.projectId !== projectId) throw new ApiError(400, 'La retención seleccionada no pertenece a este proyecto');
  if (withholding.returned && withholding.returnMovementId !== movementId) {
    throw new ApiError(400, 'Esa retención ya fue devuelta');
  }
  withholding.returned = true;
  withholding.returnMovementId = movementId;
  await withholding.save({ transaction });
}

// Revierte la marca de "devuelta" de la retención que este movimiento devolvía — usado al editar
// (si deja de ser devolución o cambia de retención) o al eliminar el movimiento.
async function clearWithholdingReturn(movementId, { transaction } = {}) {
  await CashBoxMovementWithholding.update(
    { returned: false, returnMovementId: null },
    { where: { returnMovementId: movementId }, transaction }
  );
}

// Editar o eliminar un movimiento borra/recrea (o cascada-borra) sus filas de retención — si
// alguna de ellas ya fue marcada como devuelta por OTRO movimiento (returned=true), esa devolución
// quedaría huérfana (su returnsWithholdingId apuntando a una fila que cambió o desapareció). En vez
// de intentar reconciliar ese caso automáticamente, se bloquea con un mensaje claro: primero hay
// que editar/eliminar la devolución.
async function assertNoReturnedWithholdings(movementId, { transaction } = {}) {
  const returned = await CashBoxMovementWithholding.findOne({
    where: { cashBoxMovementId: movementId, returned: true },
    transaction,
  });
  if (returned) {
    throw new ApiError(400, `No se puede editar/eliminar este pago: su retención "${returned.typeName}" ya fue devuelta. Edita o elimina primero esa devolución.`);
  }
}

async function createMovement({ cashBoxId, body, userId }) {
  const financials = await resolveMovementFinancials(body);
  const { date, concept, supportFilePath } = body;
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!financials.isWithholdingReturn && (!concept || !concept.trim())) throw new ApiError(400, 'concept es obligatorio');

  return sequelize.transaction(async (transaction) => {
    const movement = await CashBoxMovement.create({
      cashBoxId,
      amount: financials.amount,
      grossAmount: financials.grossAmount,
      projectId: financials.projectId,
      date,
      concept: (concept || '').trim() || 'Devolución de retención',
      supportFilePath: supportFilePath || null,
      isWithholdingReturn: financials.isWithholdingReturn,
      returnsWithholdingId: financials.isWithholdingReturn ? financials.returnsWithholdingId : null,
      createdBy: userId,
    }, { transaction });

    if (financials.isWithholdingReturn) {
      await applyWithholdingReturn({ returnsWithholdingId: financials.returnsWithholdingId, projectId: financials.projectId, movementId: movement.id, transaction });
    } else if (financials.withholdingRows.length) {
      await CashBoxMovementWithholding.bulkCreate(
        financials.withholdingRows.map((w) => ({ ...w, cashBoxMovementId: movement.id })),
        { transaction }
      );
    }

    return movement;
  });
}

// Reemplaza (no parchea) el ingreso completo: recalcula bruto/retenciones/neto y borra+recrea las
// filas de retención — más simple y menos propenso a errores que diferenciar cuáles cambiaron,
// aceptable porque un pago rara vez tiene más de un puñado de retenciones.
async function updateMovement(movement, body) {
  const financials = await resolveMovementFinancials({ ...body, projectId: body.projectId !== undefined ? body.projectId : movement.projectId });
  const { date, concept, supportFilePath } = body;
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!financials.isWithholdingReturn && (!concept || !concept.trim())) throw new ApiError(400, 'concept es obligatorio');

  return sequelize.transaction(async (transaction) => {
    await assertNoReturnedWithholdings(movement.id, { transaction });
    // Si dejó de ser (o cambió) la devolución de una retención puntual, libera la marca anterior
    // antes de, si corresponde, volver a marcarla (o marcar una distinta).
    await clearWithholdingReturn(movement.id, { transaction });
    await CashBoxMovementWithholding.destroy({ where: { cashBoxMovementId: movement.id }, transaction });

    movement.amount = financials.amount;
    movement.grossAmount = financials.grossAmount;
    movement.projectId = financials.projectId;
    movement.date = date;
    movement.concept = (concept || '').trim() || 'Devolución de retención';
    if (supportFilePath !== undefined) movement.supportFilePath = supportFilePath || movement.supportFilePath;
    movement.isWithholdingReturn = financials.isWithholdingReturn;
    movement.returnsWithholdingId = financials.isWithholdingReturn ? financials.returnsWithholdingId : null;
    await movement.save({ transaction });

    if (financials.isWithholdingReturn) {
      await applyWithholdingReturn({ returnsWithholdingId: financials.returnsWithholdingId, projectId: financials.projectId, movementId: movement.id, transaction });
    } else if (financials.withholdingRows.length) {
      await CashBoxMovementWithholding.bulkCreate(
        financials.withholdingRows.map((w) => ({ ...w, cashBoxMovementId: movement.id })),
        { transaction }
      );
    }

    return movement;
  });
}

async function deleteMovement(movement) {
  return sequelize.transaction(async (transaction) => {
    await assertNoReturnedWithholdings(movement.id, { transaction });
    await clearWithholdingReturn(movement.id, { transaction });
    await movement.destroy({ transaction }); // cascada: CashBoxMovementWithholding (onDelete: CASCADE)
  });
}

module.exports = { createMovement, updateMovement, deleteMovement, roundPesos };
