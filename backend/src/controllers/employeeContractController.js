// Generación de minutas de contrato de personal (contrato inicial + otrosí de renovación) y su
// historial por trabajador. No confundir con contractController.js (el Contrato con el CLIENTE de
// un proyecto, "Sección Contractual" — un concepto totalmente distinto).
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Employee, EmployeeContractDocument, Project } = require('../models');
const { getLetterheadForProject } = require('../services/letterheadService');
const { saveGeneratedFile } = require('../middleware/upload');
const { generateContractPdf } = require('../services/pdfService');
const { generateContractDocxBuffer } = require('../services/contractDocService');
const {
  CONTRACT_TYPE_LABELS, missingFieldsForContract, buildContractContent, formatDateEs,
} = require('../services/contractTemplates');
const { requestSignature } = require('../services/contractSignatureService');
const { contractPrefixForProject } = require('../services/numberingService');

function pdfDocToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Atiende tanto la ruta anidada de proyecto (/projects/:projectId/employees/:id/contracts) como la
// global (/employees/:id/contracts, ver globalEmployeeRoutes.js) — mismo trabajador, mismo
// controlador, ver el comentario equivalente en employeeController.js. Cuando la ruta trae
// :projectId se usa como filtro estricto (comportamiento sin cambios); si no, el trabajador puede
// ser administrativo (employee.projectId null) o de proyecto (se resuelve leyendo el registro, no
// la URL).
async function loadEmployee(req) {
  const where = { id: req.params.id };
  if (req.params.projectId) where.projectId = req.params.projectId;
  const employee = await Employee.findOne({ where });
  if (!employee) throw new ApiError(404, 'Empleado no encontrado');
  return employee;
}

// Prefijo del contrato: 'ADM' para personal administrativo (nunca depende de un proyecto/contrato
// de cliente), o los primeros 3 dígitos de Project.contractNumber para personal de proyecto — igual
// que en expenseController.js. A partir de employee.projectId (el dato real del trabajador), nunca
// de req.params.projectId (no existe en la ruta global).
async function contractPrefixForEmployee(employee) {
  return employee.projectId ? contractPrefixForProject(employee.projectId) : 'ADM';
}

const listContractTypes = asyncHandler(async (req, res) => {
  res.json(Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => ({ value, label })));
});

const list = asyncHandler(async (req, res) => {
  await loadEmployee(req);
  const docs = await EmployeeContractDocument.findAll({
    where: { employeeId: req.params.id },
    order: [['sequenceNumber', 'ASC']],
  });
  res.json(docs);
});

// Guarda el PDF+Word de un EmployeeContractDocument ya creado, a partir del `content` armado por
// contractTemplates.js. Compartido por generate() y generateOtrosi().
async function renderAndPersist({ employeeId, doc, content, company }) {
  const pdfBuffer = await pdfDocToBuffer(generateContractPdf(content, company));
  const docxBuffer = await generateContractDocxBuffer(content);
  const base = `${employeeId}-${doc.kind}-${doc.sequenceNumber}-${Date.now()}`;
  doc.pdfFilePath = saveGeneratedFile(doc.companyId, 'employee-contracts-generated', `${base}.pdf`, pdfBuffer);
  doc.docxFilePath = saveGeneratedFile(doc.companyId, 'employee-contracts-generated', `${base}.docx`, docxBuffer);
  await doc.save();
  return doc;
}

// Genera el contrato inicial, tomando los datos ya persistidos en la ficha del trabajador
// (contractType, contractObject, salaryValue, entryDate, contractEndDate, etc. — capturados al
// crear/editar el trabajador, ver employeeController.js). No pide nada nuevo por body: si falta
// algo, se le dice exactamente qué falta en vez de generar un documento a medias.
const generate = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  if (!employee.contractType) throw new ApiError(400, 'Este trabajador no tiene un tipo de contrato seleccionado.');

  const missing = missingFieldsForContract(employee, employee.contractType);
  if (missing.length) {
    throw new ApiError(400, 'Faltan datos obligatorios para generar este contrato.', { missingFields: missing });
  }

  const project = employee.projectId ? await Project.findByPk(employee.projectId) : null;
  const company = await getLetterheadForProject(employee.projectId);
  const sequenceNumber = await EmployeeContractDocument.count({ where: { employeeId: employee.id } });

  const doc = await EmployeeContractDocument.create({
    employeeId: employee.id,
    kind: 'contrato',
    contractType: employee.contractType,
    sequenceNumber,
    effectiveFrom: employee.entryDate,
    effectiveTo: employee.contractEndDate || null,
    valueAtIssue: employee.salaryValue,
    objectAtIssue: employee.contractObject,
    generatedBy: req.user.id,
    contractPrefix: await contractPrefixForEmployee(employee),
  });

  const content = buildContractContent({ employee, company, project, doc });
  content.signDate = formatDateEs(new Date().toISOString().slice(0, 10));

  await renderAndPersist({ employeeId: employee.id, doc, content, company });
  res.status(201).json(doc);
});

// Otrosí: solo para contratos por obra o labor (ver EmployeeDetailPage.jsx — es el único tipo que
// se prorroga/ajusta con este mecanismo en vez de generarse un contrato nuevo desde cero). Toma
// SOLO lo que cambia; lo demás se hereda del último documento (contrato u otrosí anterior) de la
// cadena de este trabajador.
const generateOtrosi = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  if (employee.contractType !== 'obra_labor') {
    throw new ApiError(400, 'El otrosí de renovación solo aplica a trabajadores con contrato por obra o labor.');
  }

  const parent = await EmployeeContractDocument.findOne({ where: { id: req.params.contractId, employeeId: employee.id } });
  if (!parent) throw new ApiError(404, 'Contrato no encontrado para este trabajador.');

  const { newContractObject, newEndDate, newSalaryValue } = req.body;
  if (!newContractObject && !newEndDate && newSalaryValue === undefined) {
    throw new ApiError(400, 'Indica al menos un cambio: nuevo objeto, nueva fecha o nuevo valor.');
  }

  const project = employee.projectId ? await Project.findByPk(employee.projectId) : null;
  const company = await getLetterheadForProject(employee.projectId);
  const sequenceNumber = await EmployeeContractDocument.count({ where: { employeeId: employee.id } });

  const doc = await EmployeeContractDocument.create({
    employeeId: employee.id,
    parentDocumentId: parent.id,
    kind: 'otrosi',
    contractType: parent.contractType,
    sequenceNumber,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: newEndDate || parent.effectiveTo,
    valueAtIssue: newSalaryValue !== undefined && newSalaryValue !== '' ? newSalaryValue : parent.valueAtIssue,
    objectAtIssue: newContractObject || parent.objectAtIssue,
    generatedBy: req.user.id,
    contractPrefix: await contractPrefixForEmployee(employee),
  });

  const changes = { newContractObject, newEndDate, newSalaryValue };
  const content = buildContractContent({ employee, company, project, doc: { ...doc.toJSON(), parent }, changes });
  content.signDate = formatDateEs(new Date().toISOString().slice(0, 10));

  await renderAndPersist({ employeeId: employee.id, doc, content, company });

  // La ficha del trabajador refleja las condiciones VIGENTES: un otrosí que cambia valor/objeto/
  // fecha actualiza a Employee, para que la próxima consulta (o un futuro otrosí) parta de ahí.
  if (newContractObject) employee.contractObject = newContractObject;
  if (newEndDate) employee.contractEndDate = newEndDate;
  if (newSalaryValue !== undefined && newSalaryValue !== '') employee.salaryValue = newSalaryValue;
  await employee.save();

  res.status(201).json(doc);
});

// Elimina un documento puntual del historial (contrato u otrosí). No toca al trabajador ni a
// ningún otro documento — si otro otrosí depende de este como su parentDocumentId, se rechaza en
// vez de romper esa cadena o cascadear el borrado.
const removeDocument = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const doc = await EmployeeContractDocument.findOne({ where: { id: req.params.contractId, employeeId: employee.id } });
  if (!doc) throw new ApiError(404, 'Documento no encontrado para este trabajador.');

  const dependentCount = await EmployeeContractDocument.count({ where: { parentDocumentId: doc.id } });
  if (dependentCount > 0) {
    throw new ApiError(400, 'Este documento tiene un otrosí asociado. Elimina primero el otrosí antes de eliminar este documento.');
  }

  await doc.destroy();
  res.status(204).send();
});

// Envía (o reenvía) el link de firma de un documento ya generado — ver
// contractSignatureService.js#requestSignature. Siempre devuelve signUrl, aunque el correo falle,
// para poder copiarlo y mandarlo a mano (mismo respaldo ya usado para "olvidé mi contraseña").
const sendForSignature = asyncHandler(async (req, res) => {
  const employee = await loadEmployee(req);
  const result = await requestSignature({
    employeeId: employee.id, contractId: req.params.contractId, projectId: employee.projectId,
  });
  res.json({
    doc: result.doc,
    signUrl: result.signUrl,
    emailSent: result.emailSent,
    emailError: result.emailError,
  });
});

module.exports = {
  listContractTypes, list, generate, generateOtrosi, removeDocument, renderAndPersist, sendForSignature,
};
