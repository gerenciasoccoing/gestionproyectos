// Migración de Personal: "una relación muchos a muchos trabajador ↔ contrato/proyecto" (ver
// EmployeeAssignment.js) — recorre todas las empresas y, para cada trabajador que YA tenía un
// projectId (personal "de proyecto"), crea la EmployeeAssignment correspondiente si todavía no
// existe una activa a ese mismo contrato. Employee.projectId NUNCA se toca (se mantiene como la
// asignación "principal", ver el comentario en Employee.js) — esto es puramente ADITIVO.
//
// Idempotente: si un trabajador ya tiene una EmployeeAssignment activa al mismo projectId (porque
// ya se creó a mano, o porque el script ya corrió antes), se omite sin duplicar.
//
// REVERSIBLE: como no modifica ninguna fila existente, "deshacer" esta migración es simplemente
// borrar las filas que creó — el resumen al final imprime sus ids exactos para poder hacerlo con
// precisión si hiciera falta:
//   DELETE FROM "EmployeeAssignments" WHERE id IN ('<id1>', '<id2>', ...);
//
// IMPORTANTE: pruébese primero contra una COPIA de la base de datos de producción (apuntando
// DATABASE_URL/ADMIN_DATABASE_URL a esa copia), nunca directamente contra producción la primera vez.
//
// Uso: node src/scripts/backfillEmployeeAssignments.js
require('dotenv').config();
const { Op } = require('sequelize');
const { Company, Employee, EmployeeAssignment } = require('../models');
const { runWithCompany } = require('../utils/tenantContext');

async function run() {
  const companies = await Company.findAll();
  let totalCreated = 0;
  let totalSkipped = 0;
  const createdIds = [];
  const failures = [];

  for (const company of companies) {
    // eslint-disable-next-line no-await-in-loop
    await runWithCompany(company.id, async () => {
      try {
        const employees = await Employee.findAll({ where: { projectId: { [Op.not]: null } } });
        let createdForCompany = 0;
        let skippedForCompany = 0;
        for (const employee of employees) {
          // eslint-disable-next-line no-await-in-loop
          const existingActive = await EmployeeAssignment.findOne({
            where: { employeeId: employee.id, projectId: employee.projectId, status: 'activo' },
          });
          if (existingActive) { skippedForCompany += 1; continue; }
          // Un trabajador ya retirado (status='retirado') queda con la asignación FINALIZADA desde
          // ya (endDate=exitDate) — no tendría sentido migrarlo como "activo" si ya no lo está.
          // eslint-disable-next-line no-await-in-loop
          const assignment = await EmployeeAssignment.create({
            employeeId: employee.id,
            projectId: employee.projectId,
            startDate: employee.entryDate,
            position: employee.position,
            status: employee.status === 'retirado' ? 'finalizado' : 'activo',
            endDate: employee.status === 'retirado' ? (employee.exitDate || null) : null,
          });
          createdIds.push(assignment.id);
          createdForCompany += 1;
        }
        totalCreated += createdForCompany;
        totalSkipped += skippedForCompany;
        if (createdForCompany || skippedForCompany) {
          console.log(`[${company.companyName}] ${createdForCompany} asignación(es) creada(s), ${skippedForCompany} ya existían.`);
        }
      } catch (err) {
        failures.push({ company: company.companyName, error: err.message });
        console.error(`[${company.companyName}] ERROR: ${err.message}`);
      }
    });
  }

  console.log('\n--- Resumen de la migración de Asignaciones de Personal ---');
  console.log(`Asignaciones creadas: ${totalCreated}`);
  console.log(`Ya existían (omitidas): ${totalSkipped}`);
  console.log(`Errores: ${failures.length}`);
  if (createdIds.length) {
    console.log(`\nIds creados (para revertir con DELETE si hiciera falta):\n${createdIds.join(', ')}`);
  }
  process.exit(failures.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
