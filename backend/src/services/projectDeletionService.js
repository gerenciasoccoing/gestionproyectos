const {
  sequelize, Contract, Policy, Minute, Milestone,
  PurchaseOrder, PurchaseOrderItem, PurchaseReceipt,
  Employee, SocialSecurityDocument, PaymentReceipt, Severance,
  Expense, ExpenseBudget, Risk,
  Budget, BudgetItem, ProgressEntry, ProgressPhoto,
} = require('../models');

// Elimina un proyecto y toda su información dependiente de forma atómica.
async function deleteProjectCascade(projectId) {
  await sequelize.transaction(async (t) => {
    const orders = await PurchaseOrder.findAll({ where: { projectId }, transaction: t });
    for (const order of orders) {
      const items = await PurchaseOrderItem.findAll({ where: { purchaseOrderId: order.id }, transaction: t });
      for (const item of items) {
        await PurchaseReceipt.destroy({ where: { purchaseOrderItemId: item.id }, transaction: t });
      }
      await PurchaseOrderItem.destroy({ where: { purchaseOrderId: order.id }, transaction: t });
    }
    await PurchaseOrder.destroy({ where: { projectId }, transaction: t });

    const employees = await Employee.findAll({ where: { projectId }, transaction: t });
    for (const employee of employees) {
      await SocialSecurityDocument.destroy({ where: { employeeId: employee.id }, transaction: t });
      await PaymentReceipt.destroy({ where: { employeeId: employee.id }, transaction: t });
      await Severance.destroy({ where: { employeeId: employee.id }, transaction: t });
    }
    await Employee.destroy({ where: { projectId }, transaction: t });

    const budgets = await Budget.findAll({ where: { projectId }, transaction: t });
    for (const budget of budgets) {
      const items = await BudgetItem.findAll({ where: { budgetId: budget.id }, transaction: t });
      for (const item of items) {
        const entries = await ProgressEntry.findAll({ where: { budgetItemId: item.id }, transaction: t });
        for (const entry of entries) {
          await ProgressPhoto.destroy({ where: { progressEntryId: entry.id }, transaction: t });
        }
        await ProgressEntry.destroy({ where: { budgetItemId: item.id }, transaction: t });
      }
      await BudgetItem.destroy({ where: { budgetId: budget.id }, transaction: t });
    }
    await Budget.destroy({ where: { projectId }, transaction: t });

    await Contract.destroy({ where: { projectId }, transaction: t });
    await Policy.destroy({ where: { projectId }, transaction: t });
    await Minute.destroy({ where: { projectId }, transaction: t });
    await Milestone.destroy({ where: { projectId }, transaction: t });
    await Expense.destroy({ where: { projectId }, transaction: t });
    await ExpenseBudget.destroy({ where: { projectId }, transaction: t });
    await Risk.destroy({ where: { projectId }, transaction: t });

    const { Project } = require('../models');
    await Project.sequelize.models.ProjectUser.destroy({ where: { projectId }, transaction: t });
    await Project.destroy({ where: { id: projectId }, transaction: t });
  });
}

module.exports = { deleteProjectCascade };
