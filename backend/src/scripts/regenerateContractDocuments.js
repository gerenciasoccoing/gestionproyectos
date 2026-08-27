// Regenera el PDF+Word de TODOS los EmployeeContractDocument ya existentes con la plantilla actual
// (tabla de datos al inicio del contrato, ver contractTemplates.js#buildPersonalInfoTable y
// hermanas). Los documentos generados antes de esa tabla quedaron con el formato viejo; este
// script los vuelve a renderizar in-place, sobrescribiendo pdfFilePath/docxFilePath del mismo
// registro (los archivos anteriores quedan huérfanos en disco sin limpiarse, igual que el resto de
// la app al borrar registros con archivo asociado — no es un comportamiento nuevo de este script).
//
// buildContractContent() ya lee siempre los datos ACTUALES de Employee/Project/company — nunca
// hace falta pedir nada nuevo — y row() ya deja en blanco cualquier campo vacío sin fallar, así
// que no se tocó contractTemplates.js para esto.
//
// Uso: node src/scripts/regenerateContractDocuments.js
require('dotenv').config();
const {
  Company, Employee, EmployeeContractDocument, Project,
} = require('../models');
const { getLetterheadForProject } = require('../services/letterheadService');
const { buildContractContent, formatDateEs } = require('../services/contractTemplates');
const { renderAndPersist } = require('../controllers/employeeContractController');
const { runWithCompany } = require('../utils/tenantContext');

// Reconstruye `changes` para un otrosí ya persistido comparando sus propios campos contra los del
// documento padre — así el resaltado "valor anterior -> NUEVO" sale igual que cuando se generó,
// sin necesitar guardar `changes` en ningún lado nuevo.
function diffChanges(doc, parent) {
  const changes = {};
  if (doc.objectAtIssue !== parent.objectAtIssue) changes.newContractObject = doc.objectAtIssue;
  if (doc.effectiveTo !== parent.effectiveTo) changes.newEndDate = doc.effectiveTo;
  if (Number(doc.valueAtIssue) !== Number(parent.valueAtIssue)) changes.newSalaryValue = doc.valueAtIssue;
  return changes;
}

async function regenerateOne(doc) {
  const employee = await Employee.findByPk(doc.employeeId);
  if (!employee) throw new Error(`Trabajador ${doc.employeeId} no encontrado`);
  const project = await Project.findByPk(employee.projectId);
  if (!project) throw new Error(`Proyecto ${employee.projectId} no encontrado`);
  const company = await getLetterheadForProject(employee.projectId);

  let content;
  if (doc.kind === 'otrosi') {
    const parent = await EmployeeContractDocument.findByPk(doc.parentDocumentId);
    if (!parent) throw new Error(`Documento padre ${doc.parentDocumentId} no encontrado para el otrosí ${doc.id}`);
    const changes = diffChanges(doc, parent);
    content = buildContractContent({ employee, company, project, doc: { ...doc.toJSON(), parent }, changes });
  } else {
    content = buildContractContent({ employee, company, project, doc });
  }
  // Fecha real de emisión de ESTE documento (no "hoy") — regenerar el formato no significa que se
  // volvió a firmar hoy.
  content.signDate = formatDateEs(doc.createdAt.toISOString().slice(0, 10));

  await renderAndPersist({ employeeId: doc.employeeId, doc, content, company });
}

async function run() {
  const companies = await Company.findAll();
  let totalOk = 0;
  const failures = [];

  for (const company of companies) {
    // eslint-disable-next-line no-await-in-loop
    await runWithCompany(company.id, async () => {
      const docs = await EmployeeContractDocument.findAll();
      console.log(`[${company.companyName}] Regenerando ${docs.length} documentos de contrato...`);

      for (const doc of docs) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await regenerateOne(doc);
          totalOk += 1;
        } catch (err) {
          failures.push({ company: company.companyName, docId: doc.id, error: err.message });
          console.error(`  ERROR en documento ${doc.id} (${doc.kind}, employeeId=${doc.employeeId}): ${err.message}`);
        }
      }
    });
  }

  console.log(`\nRegeneración completada: ${totalOk} documento(s) regenerado(s), ${failures.length} error(es).`);
  if (failures.length) {
    console.log('Documentos con error (revisar manualmente):');
    failures.forEach((f) => console.log(`  - [${f.company}] ${f.docId}: ${f.error}`));
  }
  process.exit(failures.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
