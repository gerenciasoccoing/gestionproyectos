import {
  employeesApi, generalEmployeesApi, payrollApi, generalPayrollApi,
  employeeContractsApi, generalEmployeeContractsApi,
  employeeLeavesApi, generalEmployeeLeavesApi,
  employeeDeductionsApi, generalEmployeeDeductionsApi,
} from '../../api';

// Une los tres módulos de API de Personal (fichas/nómina/contratos) en un solo objeto, sin que cada
// componente tenga que decidir cuál llamar: dentro de un proyecto usa las rutas anidadas
// (comportamiento sin cambios); desde Personal del menú principal (projectId undefined) usa las
// rutas globales (ver globalEmployeeRoutes.js en el backend) — mismo registro/tabla en los dos
// casos, ver el comentario al inicio de employeeController.js. Se arma una sola vez en
// PersonnelListPage/EmployeeDetailPage y se pasa hacia abajo en vez de projectId + projectId.
export function buildEmployeeApi(projectId) {
  const isGeneral = !projectId;
  return {
    isGeneral,
    employees: isGeneral ? {
      list: (params) => generalEmployeesApi.list(params),
      get: (id) => generalEmployeesApi.get(id),
      create: (fd) => generalEmployeesApi.create(fd),
      update: (id, data) => generalEmployeesApi.update(id, data),
      remove: (id) => generalEmployeesApi.remove(id),
      addSocialSecurity: (id, fd) => generalEmployeesApi.addSocialSecurity(id, fd),
      addPayment: (id, fd) => generalEmployeesApi.addPayment(id, fd),
      severancePreview: (id, data) => generalEmployeesApi.severancePreview(id, data),
      severanceConfirm: (id, data) => generalEmployeesApi.severanceConfirm(id, data),
      uploadPazYSalvo: (id, fd) => generalEmployeesApi.uploadPazYSalvo(id, fd),
      uploadCedula: (id, fd) => generalEmployeesApi.uploadCedula(id, fd),
      previewContractValue: (data) => generalEmployeesApi.previewContractValue(data),
    } : {
      list: (params) => employeesApi.list(projectId, params?.status),
      get: (id) => employeesApi.get(projectId, id),
      create: (fd) => employeesApi.create(projectId, fd),
      update: (id, data) => employeesApi.update(projectId, id, data),
      remove: (id) => employeesApi.remove(projectId, id),
      addSocialSecurity: (id, fd) => employeesApi.addSocialSecurity(projectId, id, fd),
      addPayment: (id, fd) => employeesApi.addPayment(projectId, id, fd),
      severancePreview: (id, data) => employeesApi.severancePreview(projectId, id, data),
      severanceConfirm: (id, data) => employeesApi.severanceConfirm(projectId, id, data),
      uploadPazYSalvo: (id, fd) => employeesApi.uploadPazYSalvo(projectId, id, fd),
      uploadCedula: (id, fd) => employeesApi.uploadCedula(projectId, id, fd),
      previewContractValue: (data) => employeesApi.previewContractValue(projectId, data),
    },
    payroll: isGeneral ? {
      preview: (id, data) => generalPayrollApi.preview(id, data),
      confirm: (id, data) => generalPayrollApi.confirm(id, data),
    } : {
      preview: (id, data) => payrollApi.preview(projectId, id, data),
      confirm: (id, data) => payrollApi.confirm(projectId, id, data),
    },
    contracts: isGeneral ? {
      list: (employeeId) => generalEmployeeContractsApi.list(employeeId),
      generate: (employeeId) => generalEmployeeContractsApi.generate(employeeId),
      generateOtrosi: (employeeId, contractId, data) => generalEmployeeContractsApi.generateOtrosi(employeeId, contractId, data),
      remove: (employeeId, contractId) => generalEmployeeContractsApi.remove(employeeId, contractId),
      requestSignature: (employeeId, contractId) => generalEmployeeContractsApi.requestSignature(employeeId, contractId),
    } : {
      list: (employeeId) => employeeContractsApi.list(projectId, employeeId),
      generate: (employeeId) => employeeContractsApi.generate(projectId, employeeId),
      generateOtrosi: (employeeId, contractId, data) => employeeContractsApi.generateOtrosi(projectId, employeeId, contractId, data),
      remove: (employeeId, contractId) => employeeContractsApi.remove(projectId, employeeId, contractId),
      requestSignature: (employeeId, contractId) => employeeContractsApi.requestSignature(projectId, employeeId, contractId),
    },
    leaves: isGeneral ? {
      list: (employeeId) => generalEmployeeLeavesApi.list(employeeId),
      create: (employeeId, formData) => generalEmployeeLeavesApi.create(employeeId, formData),
      remove: (employeeId, leaveId) => generalEmployeeLeavesApi.remove(employeeId, leaveId),
      vacationBalance: (employeeId) => generalEmployeeLeavesApi.vacationBalance(employeeId),
    } : {
      list: (employeeId) => employeeLeavesApi.list(projectId, employeeId),
      create: (employeeId, formData) => employeeLeavesApi.create(projectId, employeeId, formData),
      remove: (employeeId, leaveId) => employeeLeavesApi.remove(projectId, employeeId, leaveId),
      vacationBalance: (employeeId) => employeeLeavesApi.vacationBalance(projectId, employeeId),
    },
    deductions: isGeneral ? {
      list: (employeeId) => generalEmployeeDeductionsApi.list(employeeId),
      create: (employeeId, formData) => generalEmployeeDeductionsApi.create(employeeId, formData),
      setStatus: (employeeId, deductionId, active) => generalEmployeeDeductionsApi.setStatus(employeeId, deductionId, active),
      remove: (employeeId, deductionId) => generalEmployeeDeductionsApi.remove(employeeId, deductionId),
    } : {
      list: (employeeId) => employeeDeductionsApi.list(projectId, employeeId),
      create: (employeeId, formData) => employeeDeductionsApi.create(projectId, employeeId, formData),
      setStatus: (employeeId, deductionId, active) => employeeDeductionsApi.setStatus(projectId, employeeId, deductionId, active),
      remove: (employeeId, deductionId) => employeeDeductionsApi.remove(projectId, employeeId, deductionId),
    },
  };
}
