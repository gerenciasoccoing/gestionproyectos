const { Op } = require('sequelize');
const {
  Expense, AdminExpenseCategory, ThirdParty, CashBox, Employee,
} = require('../models');

// Reporte de Gasto Administrativo General: siempre expenseType='administrativo' (nunca mezcla
// gastos de proyecto, por construcción de este filtro — ver la especificación del cliente: "nunca
// deben aparecer en ningún dashboard/reporte de proyecto"). from/to/categoryId/supplierId/
// cashBoxId/employeeId son todos opcionales y combinables; el frontend arma mes/trimestre/año como
// un rango from-to concreto antes de llamar acá (un solo camino de filtrado, sin duplicar lógica de
// periodos en el backend). "Comparación entre periodos" se resuelve en el frontend llamando este
// mismo endpoint dos veces (periodo A y periodo B) — no hace falta un endpoint aparte.
async function getAdminExpenseReport({ from, to, adminCategoryId, supplierId, cashBoxId, employeeId } = {}) {
  const where = { expenseType: 'administrativo' };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  if (adminCategoryId) where.adminCategoryId = adminCategoryId;
  if (supplierId) where.supplierId = supplierId;
  if (cashBoxId) where.cashBoxId = cashBoxId;
  if (employeeId) where.employeeId = employeeId;

  const rows = await Expense.findAll({
    where,
    include: [
      { model: AdminExpenseCategory, as: 'adminCategory', attributes: ['id', 'name'] },
      { model: ThirdParty, as: 'supplierParty', attributes: ['id', 'name'] },
      { model: CashBox, attributes: ['id', 'name'] },
      { model: Employee, attributes: ['id', 'name'] },
    ],
    order: [['date', 'DESC']],
  });

  const totalsByCategoryMap = new Map();
  const monthlyTotalsMap = new Map();
  let totalGeneral = 0;

  for (const row of rows) {
    const amount = Number(row.amount);
    totalGeneral += amount;

    const categoryKey = row.adminCategoryId || 'sin-categoria';
    const categoryEntry = totalsByCategoryMap.get(categoryKey) || {
      categoryId: row.adminCategoryId,
      categoryName: row.adminCategory?.name || 'Sin categoría',
      total: 0,
    };
    categoryEntry.total += amount;
    totalsByCategoryMap.set(categoryKey, categoryEntry);

    const month = String(row.date).slice(0, 7); // 'YYYY-MM'
    const monthEntry = monthlyTotalsMap.get(month) || { month, total: 0 };
    monthEntry.total += amount;
    monthlyTotalsMap.set(month, monthEntry);
  }

  return {
    rows,
    totalsByCategory: [...totalsByCategoryMap.values()].sort((a, b) => b.total - a.total),
    monthlyTotals: [...monthlyTotalsMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    totalGeneral,
  };
}

module.exports = { getAdminExpenseReport };
