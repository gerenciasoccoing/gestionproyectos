const ApiError = require('../utils/ApiError');
const { Budget, BudgetItem, APU, APUComponent, PriceItem, ProgressEntry } = require('../models');

// Valor unitario efectivo de un componente: el de su insumo de la base de precios,
// o la tarifa manual (unitValue) cuando no referencia uno (ej. tarifa de transporte).
function componentUnitValue(component) {
  if (component.priceItem) return Number(component.priceItem.currentValue);
  return Number(component.unitValue || 0);
}

// El "valor base" de un insumo de mano de obra (PriceItem.currentValue) ya incluye prestaciones
// sociales (así se carga desde el catálogo oficial). El "Jornal día" que se muestra en el APU se
// obtiene entonces dividiendo ese valor base entre (1 + %prestaciones), y "TOTAL+PREST" se vuelve
// a calcular multiplicando el jornal por (1 + %prestaciones): con cantidad=1 esto siempre devuelve
// el valor base original, sin importar el % de prestaciones usado para la descomposición (es
// reversible por construcción). Centralizado acá porque budgetService, apuExportService y el
// formulario de ApuPage.jsx necesitan la misma fórmula.
function laborBreakdown(valorBase, prestacionalPercent, quantity = 1) {
  const p = Number(prestacionalPercent || 0) / 100;
  const jornalDia = valorBase / (1 + p);
  const totalPrest = Number(quantity) * (jornalDia + jornalDia * p);
  return { jornalDia, totalPrest };
}

// Costo directo del APU = suma de las 4 secciones (Materiales, Herramientas y Equipos,
// Mano de Obra, Transporte) más otros costos directos sin sección propia, según:
//   Materiales:   Σ cantidad * (1 + %desperdicio/100) * valor unitario
//   Herramientas: Σ cantidad * rendimiento * valor unitario
//   Personal:     Σ TOTAL+PREST (ver laborBreakdown) / rendimiento
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
    const { totalPrest } = laborBreakdown(componentUnitValue(c), c.prestacionalPercent, c.quantity);
    const rendimiento = Number(c.yield) || 1;
    return sum + totalPrest / rendimiento;
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

// Valida y resuelve los campos de un ítem de presupuesto antes de crearlo. La Descripción se
// toma siempre del APU elegido (no se pide ni se duplica a mano); solo se pide como texto libre
// para ítems manuales, sin APU asociado. Compartido por el presupuesto de Proyectos
// (budgetController) y el de Cotizaciones (quotationController) para que ambos flujos se
// comporten siempre igual y una corrección futura no tenga que aplicarse dos veces.
async function resolveBudgetItemFields({ budget, apuId, description, notes, unit, quantity, unitCost }) {
  if (!unit || quantity === undefined) throw new ApiError(400, 'unit y quantity son obligatorios');
  if (Number(quantity) < 0) throw new ApiError(400, 'La cantidad no puede ser negativa');

  let resolvedDescription = description;
  let resolvedUnitCost = unitCost || 0;
  if (apuId) {
    const result = await computeApuUnitCost(apuId);
    if (!result) throw new ApiError(404, 'APU no encontrado');
    resolvedDescription = result.apu.name;
    resolvedUnitCost = applyBudgetAiu(result.directCost, budget);
  } else if (!resolvedDescription) {
    throw new ApiError(400, 'description es obligatoria para un ítem manual (sin APU)');
  }

  return {
    budgetId: budget.id,
    apuId: apuId || null,
    description: resolvedDescription,
    notes: notes || null,
    unit,
    quantity,
    unitCost: resolvedUnitCost,
    totalCost: Number(quantity) * Number(resolvedUnitCost),
  };
}

module.exports = {
  computeApuUnitCost, computeSectionCosts, laborBreakdown, applyBudgetAiu, getCurrentBudgetForProject,
  getBudgetItemsWithProgress, resolveBudgetItemFields,
};
