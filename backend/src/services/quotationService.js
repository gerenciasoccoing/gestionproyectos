const ApiError = require('../utils/ApiError');
const { sequelize, Quotation, Budget, BudgetItem, Project, ProjectUser } = require('../models');

async function getQuotationWithBudget(quotationId) {
  const quotation = await Quotation.findByPk(quotationId);
  if (!quotation) return null;
  const budget = await Budget.findOne({
    where: { quotationId },
    include: [{ model: BudgetItem, as: 'items' }],
    order: [['version', 'DESC']],
  });
  return { quotation, budget };
}

// Conversión atómica: crea el proyecto, le asigna el presupuesto de la cotización como línea base,
// y marca la cotización como convertida. Si algo falla, se revierte todo.
async function convertQuotationToProject(quotationId, userId) {
  return sequelize.transaction(async (t) => {
    const quotation = await Quotation.findByPk(quotationId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!quotation) throw new ApiError(404, 'Cotización no encontrada');
    if (quotation.status === 'convertida') throw new ApiError(400, 'La cotización ya fue convertida a proyecto');

    const budget = await Budget.findOne({ where: { quotationId }, order: [['version', 'DESC']], transaction: t });
    if (!budget) throw new ApiError(400, 'La cotización no tiene un presupuesto para usar como línea base');

    const project = await Project.create({
      name: quotation.projectNameProposed,
      client: quotation.clientName,
      origin: 'cotizacion',
      quotationId: quotation.id,
      createdBy: userId,
    }, { transaction: t });

    budget.projectId = project.id;
    await budget.save({ transaction: t });

    quotation.status = 'convertida';
    quotation.convertedProjectId = project.id;
    await quotation.save({ transaction: t });

    await ProjectUser.create({ userId, projectId: project.id }, { transaction: t });

    return project;
  });
}

module.exports = { getQuotationWithBudget, convertQuotationToProject };
