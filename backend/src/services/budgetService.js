const { Budget, BudgetItem, APU, APUComponent, PriceItem, ProgressEntry } = require('../models');

// Valor unitario efectivo de un componente: el de su insumo de la base de precios,
// o la tarifa manual (unitValue) cuando no referencia uno (ej. tarifa de transporte).
function componentUnitValue(component) {
  if (component.priceItem) return Number(component.priceItem.currentValue);
  return Number(component.unitValue || 0);
}

// Costo directo del APU = suma de las 4 secciones (Materiales, Herramientas y Equipos,
// Mano de Obra, Transporte) más otros costos directos sin sección propia, según:
//   Materiales:   Σ cantidad * (1 + %desperdicio/100) * valor unitario
//   Herramientas: Σ cantidad * rendimiento * valor unitario
//   Personal:     Σ (cantidad * valor unitario * (1 + %prestacional/100)) / rendimiento
//   Transporte:   por distancia*peso*tarifa, o % sobre el subtotal de Materiales
function computeSectionCosts(components) {
  const materials = components.filter((c) => c.category === 'material');
  const herramientas = components.filter((c) => c.category === 'herramienta');
  const personal = components.filter((c) => c.category === 'personal');
  const transporte = components.filter((c) => c.category === 'transporte');

  const materialsCost = materials.reduce(
    (sum, c) => sum + Number(c.quantity) * (1 + Number(c.wastePercent || 0) / 100) * componentUnitValue(c),
    0
  );
  const herramientasCost = herramientas.reduce(
    (sum, c) => sum + Number(c.quantity) * Number(c.yield || 1) * componentUnitValue(c),
    0
  );
  const personalCost = personal.reduce((sum, c) => {
    const valorConPrestacional = componentUnitValue(c) * (1 + Number(c.prestacionalPercent || 0) / 100);
    const rendimiento = Number(c.yield) || 1;
    return sum + (Number(c.quantity) * valorConPrestacional) / rendimiento;
  }, 0);
  const transporteCost = transporte.reduce((sum, c) => {
    if (c.transportMode === 'porcentaje_materiales') {
      return sum + materialsCost * (Number(c.transportPercent || 0) / 100);
    }
    return sum + Number(c.quantity) * Number(c.transportDistance || 0) * componentUnitValue(c);
  }, 0);

  return { materialsCost, herramientasCost, personalCost, transporteCost };
}

// El APU ya no incluye AIU: es puro costo directo (materiales, herramientas, personal,
// transporte y otros costos directos). El AIU se define al crear el presupuesto (ver
// applyBudgetAiu) y se aplica sobre este costo directo al agregar el ítem al presupuesto.
async function computeApuUnitCost(apuId) {
  const apu = await APU.findByPk(apuId, {
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  if (!apu) return null;
  const sections = computeSectionCosts(apu.components);
  const componentsCost = sections.materialsCost + sections.herramientasCost + sections.personalCost + sections.transporteCost;
  const directCost = componentsCost + Number(apu.otherCosts || 0);
  return { apu, directCost, unitCost: directCost, sections: { ...sections, otherCosts: Number(apu.otherCosts || 0) } };
}

// AIU discriminado del presupuesto (Administración + Imprevistos + Utilidad), aplicado
// sobre el costo directo de un ítem basado en APU al agregarlo al presupuesto.
function applyBudgetAiu(directCost, budget) {
  const aiuPercent = Number(budget.adminPercent || 0) + Number(budget.imprevistosPercent || 0) + Number(budget.utilidadPercent || 0);
  return directCost * (1 + aiuPercent / 100);
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

module.exports = { computeApuUnitCost, computeSectionCosts, applyBudgetAiu, getCurrentBudgetForProject, getBudgetItemsWithProgress };
