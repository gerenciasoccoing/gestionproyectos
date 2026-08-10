const { computeSectionCosts } = require('./budgetService');
const { APU, APUComponent, PriceItem } = require('../models');

function componentUnitValue(c) {
  if (c.priceItem) return Number(c.priceItem.currentValue);
  return Number(c.unitValue || 0);
}

// Arma los datos de un APU ya listos para exportar (PDF o Excel), replicando las 4 secciones del
// formato "modelo_apu.xlsx" (Herramientas y Equipo, Materiales, Mano de Obra, Transporte) más
// costos indirectos (AIU) y el total. El AIU es un parámetro del momento de exportar (no se
// guarda en el APU): se recibe como { adminPercent, imprevistosPercent, utilidadPercent }.
function buildApuExportData(apu, aiu = {}) {
  const components = apu.components || [];

  const herramientas = components
    .filter((c) => c.category === 'herramienta')
    .map((c) => {
      const vUnit = componentUnitValue(c);
      const rend = Number(c.yield || 1);
      return {
        code: c.priceItem?.code || '-',
        description: c.priceItem?.name || c.description || '-',
        unit: c.priceItem?.unit || '-',
        vUnit,
        rend,
        parcial: Number(c.quantity) * rend * vUnit,
      };
    });
  // "Herramienta menor" y otros costos directos sin insumo propio (ver APU.otherCosts) se
  // muestran como una fila adicional de la sección I, tal como aparecen en el listado original.
  const otherCosts = Number(apu.otherCosts || 0);
  if (otherCosts > 0) {
    herramientas.push({ code: '-', description: 'Herramienta menor / otros costos directos', unit: '-', vUnit: null, rend: null, parcial: otherCosts });
  }

  const materiales = components
    .filter((c) => c.category === 'material')
    .map((c) => {
      const vUnit = componentUnitValue(c);
      const cantidad = Number(c.quantity);
      const wastePercent = Number(c.wastePercent || 0);
      const cantDesp = cantidad * (1 + wastePercent / 100);
      return {
        code: c.priceItem?.code || '-',
        description: c.priceItem?.name || '-',
        unit: c.priceItem?.unit || '-',
        cantidad,
        wastePercent,
        cantDesp,
        vUnit,
        parcial: cantDesp * vUnit,
      };
    });

  const personal = components
    .filter((c) => c.category === 'personal')
    .map((c) => {
      const jornal = componentUnitValue(c);
      const prestPercent = Number(c.prestacionalPercent || 0);
      const totalPrest = jornal * (1 + prestPercent / 100);
      const rend = Number(c.yield) || 1;
      const cant = Number(c.quantity);
      return {
        code: c.priceItem?.code || '-',
        description: c.priceItem?.name || '-',
        cant,
        jornal,
        prestPercent,
        totalPrest,
        rend,
        parcial: (cant * totalPrest) / rend,
      };
    });

  const transporte = components
    .filter((c) => c.category === 'transporte')
    .map((c) => {
      const vUnit = componentUnitValue(c);
      const isPercent = c.transportMode === 'porcentaje_materiales';
      const materialesBase = materiales.reduce((s, m) => s + m.parcial, 0);
      const parcial = isPercent
        ? materialesBase * (Number(c.transportPercent || 0) / 100)
        : Number(c.quantity) * Number(c.transportDistance || 0) * vUnit;
      return {
        code: c.priceItem?.code || '-',
        description: c.priceItem?.name || c.description || '-',
        distancia: isPercent ? null : Number(c.transportDistance || 0),
        peso: isPercent ? null : Number(c.quantity),
        vUnit: isPercent ? null : vUnit,
        percent: isPercent ? Number(c.transportPercent || 0) : null,
        parcial,
      };
    });

  const sections = computeSectionCosts(components);
  const herramientasSubtotal = sections.herramientasCost + otherCosts;
  const materialesSubtotal = sections.materialsCost;
  const personalSubtotal = sections.personalCost;
  const transporteSubtotal = sections.transporteCost;
  const directCost = herramientasSubtotal + materialesSubtotal + personalSubtotal + transporteSubtotal;

  const adminPercent = Number(aiu.adminPercent || 0);
  const imprevistosPercent = Number(aiu.imprevistosPercent || 0);
  const utilidadPercent = Number(aiu.utilidadPercent || 0);
  const aiuPercent = adminPercent + imprevistosPercent + utilidadPercent;
  const adminAmount = (directCost * adminPercent) / 100;
  const imprevistosAmount = (directCost * imprevistosPercent) / 100;
  const utilidadAmount = (directCost * utilidadPercent) / 100;
  const aiuAmount = adminAmount + imprevistosAmount + utilidadAmount;

  return {
    apu,
    herramientas,
    materiales,
    personal,
    transporte,
    herramientasSubtotal,
    materialesSubtotal,
    personalSubtotal,
    transporteSubtotal,
    directCost,
    aiu: { adminPercent, imprevistosPercent, utilidadPercent, aiuPercent, adminAmount, imprevistosAmount, utilidadAmount, aiuAmount },
    totalWithAiu: directCost + aiuAmount,
  };
}

// Arma el mapa APU -> ficha de exportación para todos los ítems de un presupuesto que tengan un
// APU asociado, con el AIU de ese presupuesto. Compartido por la exportación de Presupuesto
// (Proyectos, en budgetController) y la de Cotizaciones (quotationController): ambas generan el
// mismo anexo de APU con el mismo generador (drawApuAnalysis / writeApuSheet), sin duplicar esta
// consulta ni el armado de los datos en dos lugares distintos.
async function buildApuDataByIdMap(items, budget) {
  const apuIds = [...new Set(items.filter((it) => it.apuId).map((it) => it.apuId))];
  const apus = await APU.findAll({
    where: { id: apuIds },
    include: [{ model: APUComponent, as: 'components', include: [{ model: PriceItem, as: 'priceItem' }] }],
  });
  const aiu = { adminPercent: budget.adminPercent, imprevistosPercent: budget.imprevistosPercent, utilidadPercent: budget.utilidadPercent };
  return new Map(apus.map((apu) => [apu.id, buildApuExportData(apu, aiu)]));
}

module.exports = { buildApuExportData, buildApuDataByIdMap };
