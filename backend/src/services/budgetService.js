const { Budget, BudgetItem, APU, APUComponent, PriceItem, ProgressEntry } = require('../models');

// Costo unitario del APU = costo directo (Σ rendimiento * valor unitario del insumo, más otros
// costos directos sin precio unitario propio, ej. herramienta menor) * (1 + AIU%)
async function computeApuUnitCost(apuId) {
  const apu = await APU.findByPk(apuId, {
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  if (!apu) return null;
  const componentsCost = apu.components.reduce(
    (sum, c) => sum + Number(c.yield) * Number(c.priceItem.currentValue),
    0
  );
  const directCost = componentsCost + Number(apu.otherCosts || 0);
  const unitCost = directCost * (1 + Number(apu.aiuPercent) / 100);
  return { apu, directCost, unitCost };
}

async function getCurrentBudgetForProject(projectId) {
  return Budget.findOne({
    where: { projectId },
    include: [{ model: BudgetItem, as: 'items' }],
    order: [['version', 'DESC']],
  });
}

// Devuelve los ítems de presupuesto del proyecto con avance acumulado, % y valor ejecutado calculados.
async function getBudgetItemsWithProgress(projectId) {
  const budget = await getCurrentBudgetForProject(projectId);
  if (!budget) return { budget: null, items: [] };

  const items = await Promise.all(
    budget.items.map(async (item) => {
      const entries = await ProgressEntry.findAll({ where: { budgetItemId: item.id } });
      const accumulatedQty = entries.reduce((sum, e) => sum + Number(e.quantityExecuted), 0);
      const percent = Number(item.quantity) > 0 ? (accumulatedQty / Number(item.quantity)) * 100 : 0;
      const executedValue = accumulatedQty * Number(item.unitCost);
      return {
        ...item.toJSON(),
        accumulatedQty,
        percent: Math.round(percent * 100) / 100,
        executedValue,
      };
    })
  );

  return { budget, items };
}

module.exports = { computeApuUnitCost, getCurrentBudgetForProject, getBudgetItemsWithProgress };
