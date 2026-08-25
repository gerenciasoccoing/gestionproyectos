const path = require('path');
const { Project, Consortium } = require('../models');
const { getSettingsForPdf } = require('../controllers/companySettingsController');
const { UPLOAD_ROOT } = require('../middleware/upload');

// Resuelve qué datos de membrete (logo/nombre/NIT/dirección/teléfono/representante legal) usar al
// generar un documento dentro de un proyecto: los del consorcio/unión temporal asignado a ese
// proyecto (Project.consortiumId) si tiene uno, o los de la empresa principal (tenant) en caso
// contrario — incluyendo proyectos sin asignación (consortiumId null, el default) y llamadas sin
// projectId (documentos que no cuelgan de un proyecto, p. ej. una orden de compra global o una
// cotización aún no convertida). Devuelve siempre la misma forma que getSettingsForPdf(), así que
// ningún generador de PDF/Word necesita saber de dónde salió el dato — nunca se mezclan campos de
// dos entidades distintas porque todo el objeto sale de una sola fuente.
async function getLetterheadForProject(projectId) {
  if (!projectId) return getSettingsForPdf();

  const project = await Project.findByPk(projectId);
  if (!project?.consortiumId) return getSettingsForPdf();

  const consortium = await Consortium.findByPk(project.consortiumId);
  if (!consortium) return getSettingsForPdf();

  return {
    companyName: consortium.name,
    nit: consortium.nit,
    address: consortium.address,
    phone: consortium.phone,
    managerName: consortium.legalRepName,
    logoPath: consortium.logoPath ? path.join(UPLOAD_ROOT, consortium.logoPath) : null,
  };
}

module.exports = { getLetterheadForProject };
