const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const { Project, sequelize } = require('../models');
const { getCurrentCompanyId } = require('../utils/tenantContext');

// Consecutivo atómico de comprobantes (egresos/ingresos), independiente por empresa y por tipo —
// ver VoucherCounter.js para el porqué del UPSERT en vez de MAX(columna)+1. Consulta SQL cruda,
// fuera del alcance de applyTenantScoping.js (que solo intercepta el ORM): companyId y la
// transacción activa se pasan a mano para que la política RLS (Capa 2) la deje pasar y quede
// scopeada a la misma fila que el resto de la petición ve.
async function nextVoucherNumber(kind, transaction) {
  const companyId = getCurrentCompanyId();
  const [row] = await sequelize.query(
    `INSERT INTO "VoucherCounters" ("id", "companyId", "kind", "value", "createdAt", "updatedAt")
     VALUES (:id, :companyId, :kind, 1, now(), now())
     ON CONFLICT ("companyId", "kind") DO UPDATE SET "value" = "VoucherCounters"."value" + 1, "updatedAt" = now()
     RETURNING "value"`,
    { replacements: { id: uuidv4(), companyId, kind }, transaction, type: QueryTypes.SELECT }
  );
  return row.value;
}

// Número de comprobante de egreso (Gastos) — mismo campo Expense.expenseNumber de siempre, ahora
// asignado por el contador atómico en vez de Expense.max('expenseNumber')+1 (que sí podía
// colisionar bajo dos creaciones simultáneas: dos transacciones podían leer el mismo MAX antes de
// que cualquiera de las dos confirmara). Firma sin cambios a propósito: expenseController.js y
// purchaseOrderController.js#convertToExpense lo siguen llamando igual que siempre.
async function nextExpenseNumber(transaction) {
  return nextVoucherNumber('egreso', transaction);
}

// Número de comprobante de ingreso (Cajas) — ver cashBoxMovementService.js#createMovement.
async function nextIncomeNumber(transaction) {
  return nextVoucherNumber('ingreso', transaction);
}

// Primeros 3 dígitos de Project.contractNumber, para usar como prefijo visual en gastos/órdenes
// de compra/contratos laborales/ingresos de caja AL MOMENTO DE CREARSE cada uno — null si el
// proyecto no tiene número de contrato asignado (comportamiento sin cambios: se crea igual, solo
// sin prefijo) o si el registro no tiene proyecto. Se guarda en el registro mismo (no se recalcula
// después) para que cambiar el número del contrato más adelante no altere el prefijo de lo ya creado.
async function contractPrefixForProject(projectId, transaction) {
  if (!projectId) return null;
  const project = await Project.findByPk(projectId, { transaction });
  if (!project?.contractNumber) return null;
  return project.contractNumber.slice(0, 3);
}

module.exports = { nextExpenseNumber, nextIncomeNumber, contractPrefixForProject };
