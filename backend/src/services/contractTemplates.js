// Minutas de contrato de personal (ver docs entregados en el chat para el texto revisado por el
// usuario). Una sola fuente de verdad consumida tanto por pdfService.js#generateContractPdf como
// por contractDocService.js#generateContractDocx — evita mantener el texto legal duplicado en dos
// formatos. Cada builder recibe { employee, company, project, doc, changes } y devuelve una
// estructura genérica { documentTitle, intro, clauses: [{heading, body}], signatureBlock } que
// ambos renderers saben dibujar.
//
// AVISO: estas minutas fueron redactadas con criterio sobre la normativa colombiana vigente al
// momento de escribirlas (CST, Ley 50/1990, Ley 789/2002, Decreto 1072/2015, Ley 1562/2012, Ley
// 1581/2012), pero no son asesoría legal. Deben ser revisadas por un abogado laboralista antes de
// usarse para vincular personal real.

function money(n) {
  return `$ ${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

function formatDateEs(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${y}`;
}

const DOCUMENT_TYPE_LABELS = { CC: 'Cédula de Ciudadanía', CE: 'Cédula de Extranjería', PASAPORTE: 'Pasaporte', PEP: 'Permiso Especial de Permanencia' };

// Campos de Employee obligatorios para generar el contrato inicial de cada tipo. El controlador
// (contractController.js) usa esto para devolver un 400 con el detalle exacto de qué falta, y el
// frontend lo mismo para deshabilitar el botón "Generar contrato" con un mensaje claro en vez de
// dejar que el usuario descubra el error después de intentarlo.
const REQUIRED_FIELDS_BY_TYPE = {
  obra_labor: ['documentType', 'documentNumber', 'address', 'city', 'contractObject', 'entryDate', 'salaryValue', 'epsName', 'pensionFundName', 'arlName'],
  termino_fijo: ['documentType', 'documentNumber', 'address', 'city', 'entryDate', 'contractEndDate', 'salaryValue', 'epsName', 'pensionFundName', 'arlName'],
  termino_indefinido: ['documentType', 'documentNumber', 'address', 'city', 'entryDate', 'salaryValue', 'epsName', 'pensionFundName', 'arlName'],
  aprendizaje: ['documentType', 'documentNumber', 'entryDate', 'contractEndDate', 'salaryValue', 'epsName', 'arlName'],
  prestacion_servicios: ['documentType', 'documentNumber', 'address', 'city', 'contractObject', 'entryDate', 'contractEndDate', 'salaryValue'],
  subcontratista_natural: ['documentType', 'documentNumber', 'address', 'city', 'contractObject', 'entryDate', 'contractEndDate', 'salaryValue', 'arlName'],
  subcontratista_juridica: ['documentType', 'documentNumber', 'subcontractorLegalName', 'subcontractorNit', 'subcontractorLegalRep', 'contractObject', 'entryDate', 'contractEndDate', 'salaryValue'],
};

const FIELD_LABELS = {
  documentType: 'Tipo de documento', documentNumber: 'Número de documento', address: 'Dirección', city: 'Ciudad',
  contractObject: 'Objeto / labor a realizar', entryDate: 'Fecha de inicio', contractEndDate: 'Fecha de terminación',
  salaryValue: 'Salario / honorarios / valor del contrato', epsName: 'EPS', pensionFundName: 'Fondo de pensión', arlName: 'ARL',
  subcontractorLegalName: 'Razón social del subcontratista', subcontractorNit: 'NIT del subcontratista', subcontractorLegalRep: 'Representante legal',
};

const CONTRACT_TYPE_LABELS = {
  obra_labor: 'Contrato por Obra o Labor Contratada',
  termino_fijo: 'Contrato a Término Fijo',
  termino_indefinido: 'Contrato a Término Indefinido',
  aprendizaje: 'Contrato de Aprendizaje',
  prestacion_servicios: 'Contrato de Prestación de Servicios',
  subcontratista_natural: 'Contrato de Subcontratación — Persona Natural',
  subcontratista_juridica: 'Contrato de Subcontratación — Persona Jurídica',
};

// employee acá es un objeto plano con, ADEMÁS de los campos de Employee, contractEndDate (no es
// una columna del modelo: la fecha de fin de UN contrato en particular vive en
// EmployeeContractDocument.effectiveTo, no en el trabajador — ver contractController.js).
function missingFieldsForContract(employee, contractType) {
  const required = REQUIRED_FIELDS_BY_TYPE[contractType] || [];
  return required.filter((f) => employee[f] === undefined || employee[f] === null || employee[f] === '').map((f) => FIELD_LABELS[f] || f);
}

function partiesBlock({ employee, company }) {
  const docLabel = DOCUMENT_TYPE_LABELS[employee.documentType] || employee.documentType;
  return { docLabel, companyName: company.companyName, companyNit: company.nit, managerName: company.managerName || '(sin gerente configurado — ver Administración > Datos de la Empresa)' };
}

const CONFIDENTIALITY_CLAUSE = (partyLabel) => `${partyLabel} se obliga a guardar reserva sobre la información técnica, comercial, financiera y de clientes de la contraparte a la que tenga acceso con ocasión de la ejecución de este contrato, tanto durante su vigencia como después de su terminación, absteniéndose de divulgarla o usarla en beneficio propio o de terceros.`;

const DATA_PROTECTION_CLAUSE = (partyLabel) => `${partyLabel} autoriza el tratamiento de sus datos personales (incluyendo datos sensibles de salud cuando sea necesario) para la gestión de este contrato, nómina, seguridad social y cumplimiento de obligaciones legales, conforme a la Ley 1581 de 2012, pudiendo ejercer en cualquier momento sus derechos de acceso, corrección y supresión.`;

function buildObraLabor({ employee, company, project, doc }) {
  const p = partiesBlock({ employee, company });
  return {
    documentTitle: 'CONTRATO INDIVIDUAL DE TRABAJO POR OBRA O LABOR CONTRATADA',
    intro: `Entre los suscritos, ${p.companyName}, sociedad identificada con NIT ${p.companyNit}, representada legalmente por ${p.managerName} (en adelante "EL EMPLEADOR"), y ${employee.name}, identificado(a) con ${p.docLabel} No. ${employee.documentNumber}, domiciliado(a) en ${employee.address}, ${employee.city} (en adelante "EL TRABAJADOR"), se celebra el presente Contrato Individual de Trabajo por Obra o Labor Contratada, regido por las siguientes cláusulas:`,
    clauses: [
      { heading: 'PRIMERA — Objeto.', body: `EL TRABAJADOR se obliga a prestar sus servicios personales como ${employee.position} para la ejecución de la obra o labor determinada: "${doc.objectAtIssue}", dentro del proyecto ${project.name}, bajo la continuada dependencia y subordinación de EL EMPLEADOR.` },
      { heading: 'SEGUNDA — Duración.', body: `El presente contrato dura por el tiempo que demande la ejecución de la obra o labor contratada, iniciando el ${formatDateEs(doc.effectiveFrom)}. Terminará de forma automática al concluir dicha obra o labor, sin necesidad de preaviso, de conformidad con el artículo 61 del Código Sustantivo del Trabajo (CST), con la sola notificación de la fecha de terminación con al menos un (1) día de anticipación.` },
      { heading: 'TERCERA — Salario y forma de pago.', body: `EL EMPLEADOR pagará a EL TRABAJADOR un salario de ${money(doc.valueAtIssue)} mensuales, más el auxilio de transporte legal cuando aplique según la ley vigente.` },
      { heading: 'CUARTA — Jornada de trabajo.', body: 'La jornada laboral será la máxima legal vigente, distribuida de acuerdo con las necesidades del servicio y la obra, respetando los descansos de ley.' },
      { heading: 'QUINTA — Obligaciones de las partes.', body: 'EL TRABAJADOR se obliga a ejecutar la labor con dedicación, cuidado y diligencia, cumplir el reglamento interno de trabajo y las normas de seguridad y salud en el trabajo, y guardar confidencialidad. EL EMPLEADOR se obliga a pagar oportunamente el salario y prestaciones sociales de ley, afiliar y mantener afiliado a EL TRABAJADOR al Sistema General de Seguridad Social Integral, y suministrar los elementos de protección personal necesarios.' },
      { heading: 'SEXTA — Seguridad social.', body: `EL EMPLEADOR afiliará a EL TRABAJADOR a la EPS ${employee.epsName}, al fondo de pensiones ${employee.pensionFundName} y a la ARL ${employee.arlName}.` },
      { heading: 'SÉPTIMA — Confidencialidad.', body: CONFIDENTIALITY_CLAUSE('EL TRABAJADOR') },
      { heading: 'OCTAVA — Tratamiento de datos personales.', body: DATA_PROTECTION_CLAUSE('EL TRABAJADOR') },
      { heading: 'NOVENA — Terminación del contrato.', body: 'El contrato termina: (a) por la conclusión de la obra o labor contratada; (b) por mutuo acuerdo entre las partes; (c) por justa causa, conforme al artículo 62 del CST; (d) por las demás causales legales aplicables a esta modalidad contractual.' },
      { heading: 'DÉCIMA — Modificaciones.', body: 'Cualquier prórroga, modificación de plazo, valor u objeto se hará mediante otrosí suscrito por ambas partes, que hará parte integral de este contrato.' },
    ],
    signatureBlock: [
      { role: 'EL EMPLEADOR', name: p.managerName, idLabel: 'NIT', idValue: p.companyNit },
      { role: 'EL TRABAJADOR', name: employee.name, idLabel: p.docLabel, idValue: employee.documentNumber },
    ],
  };
}

function buildOtrosi({ employee, company, project, doc, changes }) {
  const p = partiesBlock({ employee, company });
  const parent = doc.parent; // EmployeeContractDocument del contrato/otrosí que este modifica
  const changeLines = [];
  if (changes.newContractObject) changeLines.push(`Objeto/labor: de "${parent.objectAtIssue}" a "${changes.newContractObject}".`);
  if (changes.newEndDate) changeLines.push(`Plazo: se ajusta la fecha estimada de terminación de la obra a ${formatDateEs(changes.newEndDate)} (referencial, sin perjuicio de que el contrato sigue terminando con la conclusión real de la obra o labor).`);
  if (changes.newSalaryValue) changeLines.push(`Salario: de ${money(parent.valueAtIssue)} a ${money(changes.newSalaryValue)}, a partir del ${formatDateEs(doc.effectiveFrom)}.`);

  return {
    documentTitle: `OTROSÍ No. ${doc.sequenceNumber} AL CONTRATO DE TRABAJO POR OBRA O LABOR`,
    intro: `Entre ${p.companyName}, NIT ${p.companyNit}, representada legalmente por ${p.managerName} (EL EMPLEADOR), y ${employee.name}, identificado(a) con ${p.docLabel} No. ${employee.documentNumber} (EL TRABAJADOR), quienes suscribieron el Contrato Individual de Trabajo por Obra o Labor Contratada para la obra/labor "${parent.objectAtIssue}", acuerdan modificarlo mediante el presente Otrosí, así:`,
    clauses: [
      { heading: 'PRIMERA — Antecedente.', body: 'El contrato original sigue plenamente vigente en todo lo no modificado por este otrosí.' },
      { heading: 'SEGUNDA — Modificaciones.', body: changeLines.length ? changeLines.join(' ') : 'Sin cambios adicionales a los ya registrados.' },
      { heading: 'TERCERA — Vigencia de las demás cláusulas.', body: 'Las demás cláusulas del contrato original (jornada, obligaciones de las partes, seguridad social, confidencialidad, tratamiento de datos personales y causales de terminación) continúan vigentes sin modificación.' },
    ],
    signatureBlock: [
      { role: 'EL EMPLEADOR', name: p.managerName, idLabel: 'NIT', idValue: p.companyNit },
      { role: 'EL TRABAJADOR', name: employee.name, idLabel: p.docLabel, idValue: employee.documentNumber },
    ],
  };
}

function buildTerminoFijoOIndefinido({ employee, company, project, doc }, indefinido) {
  const p = partiesBlock({ employee, company });
  const durationClause = indefinido
    ? { heading: 'SEGUNDA — Duración.', body: `El presente contrato no tiene término fijo de duración; regirá mientras subsistan las causas que le dieron origen y la materia del trabajo, iniciando el ${formatDateEs(doc.effectiveFrom)}.` }
    : { heading: 'SEGUNDA — Duración.', body: `El presente contrato tiene una duración contada a partir del ${formatDateEs(doc.effectiveFrom)} y hasta el ${formatDateEs(doc.effectiveTo)}. Podrá prorrogarse indefinidamente por períodos iguales o inferiores, salvo que alguna de las partes dé aviso escrito de no prórroga con no menos de treinta (30) días de anticipación al vencimiento del plazo, conforme al artículo 46 del CST.` };
  const terminationClause = indefinido
    ? { heading: 'DÉCIMA — Terminación.', body: 'Por mutuo acuerdo, por justa causa conforme al artículo 62 del CST, o por decisión unilateral de cualquiera de las partes con el preaviso e indemnización que correspondan según la ley (art. 64 del CST) cuando la terminación sea sin justa causa por parte de EL EMPLEADOR.' }
    : { heading: 'DÉCIMA — Terminación.', body: 'El contrato termina por vencimiento del plazo pactado (previo aviso de no prórroga), por mutuo acuerdo, o por justa causa conforme al artículo 62 del CST.' };

  return {
    documentTitle: indefinido ? 'CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO INDEFINIDO' : 'CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO FIJO',
    intro: `Entre ${p.companyName}, NIT ${p.companyNit}, representada legalmente por ${p.managerName} (EL EMPLEADOR), y ${employee.name}, identificado(a) con ${p.docLabel} No. ${employee.documentNumber}, domiciliado(a) en ${employee.address}, ${employee.city} (EL TRABAJADOR), se celebra el presente contrato de trabajo:`,
    clauses: [
      { heading: 'PRIMERA — Objeto.', body: `EL TRABAJADOR prestará sus servicios personales como ${employee.position}, bajo continuada dependencia y subordinación de EL EMPLEADOR, dentro del proyecto ${project.name}.` },
      durationClause,
      { heading: 'TERCERA — Salario y forma de pago.', body: `${money(doc.valueAtIssue)} mensuales, más auxilio de transporte legal cuando aplique.` },
      { heading: 'CUARTA — Jornada de trabajo.', body: 'La jornada laboral será la máxima legal vigente.' },
      { heading: 'QUINTA — Obligaciones de las partes.', body: 'EL TRABAJADOR se obliga a ejecutar la labor con dedicación, cuidado y diligencia, cumplir el reglamento interno de trabajo y las normas de seguridad y salud en el trabajo. EL EMPLEADOR se obliga a pagar oportunamente el salario y prestaciones sociales de ley y a mantener la afiliación a seguridad social.' },
      { heading: 'SEXTA — Seguridad social.', body: `EL EMPLEADOR afiliará a EL TRABAJADOR a la EPS ${employee.epsName}, al fondo de pensiones ${employee.pensionFundName} y a la ARL ${employee.arlName}.` },
      { heading: 'SÉPTIMA — Confidencialidad.', body: CONFIDENTIALITY_CLAUSE('EL TRABAJADOR') },
      { heading: 'OCTAVA — Tratamiento de datos personales.', body: DATA_PROTECTION_CLAUSE('EL TRABAJADOR') },
      terminationClause,
    ],
    signatureBlock: [
      { role: 'EL EMPLEADOR', name: p.managerName, idLabel: 'NIT', idValue: p.companyNit },
      { role: 'EL TRABAJADOR', name: employee.name, idLabel: p.docLabel, idValue: employee.documentNumber },
    ],
  };
}

function buildAprendizaje({ employee, company, project, doc }) {
  const p = partiesBlock({ employee, company });
  return {
    documentTitle: 'CONTRATO DE APRENDIZAJE',
    intro: `Entre ${p.companyName}, NIT ${p.companyNit}, representada legalmente por ${p.managerName} (en adelante "LA EMPRESA PATROCINADORA"), y ${employee.name}, identificado(a) con ${p.docLabel} No. ${employee.documentNumber} (en adelante "EL APRENDIZ"), se celebra el presente Contrato de Aprendizaje, de conformidad con la Ley 789 de 2002. Este contrato no genera relación laboral ni salario, sino apoyo de sostenimiento, por tratarse de una forma especial de vinculación con fines de formación.`,
    clauses: [
      { heading: 'PRIMERA — Objeto.', body: `EL APRENDIZ desarrollará su etapa práctica mediante actividades de tipo formativo en el proyecto ${project.name}, en el cargo/función de ${employee.position}.` },
      { heading: 'SEGUNDA — Duración.', body: `El contrato tiene una duración desde el ${formatDateEs(doc.effectiveFrom)} hasta el ${formatDateEs(doc.effectiveTo)}, sin exceder en conjunto el término máximo de dos (2) años previsto en la ley.` },
      { heading: 'TERCERA — Apoyo de sostenimiento.', body: `LA EMPRESA PATROCINADORA reconocerá a EL APRENDIZ un apoyo de sostenimiento mensual de ${money(doc.valueAtIssue)}, de conformidad con el artículo 30 de la Ley 789 de 2002 (mínimo el 50% de un SMLMV en etapa lectiva y el 75% en etapa productiva, o el 100% si la tasa de desempleo nacional es inferior al 10%).` },
      { heading: 'CUARTA — Afiliación a seguridad social.', body: `EL APRENDIZ estará afiliado durante toda la vigencia del contrato a la EPS ${employee.epsName} en la modalidad correspondiente a aprendices, y a la ARL ${employee.arlName}; no genera afiliación obligatoria al Sistema General de Pensiones.` },
      { heading: 'QUINTA — Obligaciones de LA EMPRESA PATROCINADORA.', body: 'Facilitar los medios para el desarrollo de la etapa práctica, pagar oportunamente el apoyo de sostenimiento, afiliar a EL APRENDIZ a salud y ARL, y asignar un supervisor o instructor.' },
      { heading: 'SEXTA — Obligaciones de EL APRENDIZ.', body: 'Cumplir el plan de aprendizaje y las actividades asignadas, observar las normas de disciplina y de seguridad y salud en el trabajo, e informar oportunamente cualquier situación que afecte su etapa práctica.' },
      { heading: 'SÉPTIMA — Confidencialidad.', body: CONFIDENTIALITY_CLAUSE('EL APRENDIZ') },
      { heading: 'OCTAVA — Tratamiento de datos personales.', body: DATA_PROTECTION_CLAUSE('EL APRENDIZ') },
      { heading: 'NOVENA — Terminación.', body: 'El contrato termina por la culminación del programa de formación, por mutuo acuerdo, o por incumplimiento grave de las obligaciones de EL APRENDIZ, sin que en ningún caso dé lugar al reconocimiento de prestaciones sociales propias de un contrato de trabajo.' },
    ],
    signatureBlock: [
      { role: 'LA EMPRESA PATROCINADORA', name: p.managerName, idLabel: 'NIT', idValue: p.companyNit },
      { role: 'EL APRENDIZ', name: employee.name, idLabel: p.docLabel, idValue: employee.documentNumber },
    ],
  };
}

function buildPrestacionServicios({ employee, company, project, doc }) {
  const p = partiesBlock({ employee, company });
  return {
    documentTitle: 'CONTRATO DE PRESTACIÓN DE SERVICIOS',
    intro: `Entre ${p.companyName}, NIT ${p.companyNit}, representada legalmente por ${p.managerName} (en adelante "EL CONTRATANTE"), y ${employee.name}, identificado(a) con ${p.docLabel} No. ${employee.documentNumber}, domiciliado(a) en ${employee.address}, ${employee.city} (en adelante "EL CONTRATISTA"), se celebra el presente Contrato de Prestación de Servicios, de naturaleza civil. Este contrato NO constituye relación laboral ni genera subordinación, prestaciones sociales ni relación de dependencia.`,
    clauses: [
      { heading: 'PRIMERA — Objeto.', body: `EL CONTRATISTA se obliga, de manera independiente y autónoma, a prestar a EL CONTRATANTE el servicio de: "${doc.objectAtIssue}", relacionado con el proyecto ${project.name}, empleando sus propios medios, conocimiento técnico y sin sujeción a horario ni subordinación laboral alguna.` },
      { heading: 'SEGUNDA — Autonomía e independencia.', body: 'EL CONTRATISTA ejecutará el objeto contratado con plena autonomía técnica, administrativa y directiva, sin subordinación, dependencia continuada ni sujeción a horario frente a EL CONTRATANTE.' },
      { heading: 'TERCERA — Duración.', body: `Del ${formatDateEs(doc.effectiveFrom)} al ${formatDateEs(doc.effectiveTo)}, sin perjuicio de que pueda darse por terminado anticipadamente conforme a la cláusula sexta.` },
      { heading: 'CUARTA — Honorarios y forma de pago.', body: `EL CONTRATANTE pagará a EL CONTRATISTA la suma de ${money(doc.valueAtIssue)} por concepto de honorarios, previa presentación de cuenta de cobro o factura, sujeta a las retenciones de ley.` },
      { heading: 'QUINTA — Seguridad social del contratista.', body: 'EL CONTRATISTA declara que se encuentra afiliado y al día en el pago de sus aportes al Sistema General de Seguridad Social Integral en calidad de trabajador independiente, y se obliga a mantener dicha afiliación durante toda la vigencia del contrato, exonerando a EL CONTRATANTE de cualquier responsabilidad por su incumplimiento.' },
      { heading: 'SEXTA — Terminación.', body: 'El contrato termina por vencimiento del plazo pactado, mutuo acuerdo, incumplimiento de las obligaciones de cualquiera de las partes (previo requerimiento escrito), o terminación unilateral con un preaviso de treinta (30) días.' },
      { heading: 'SÉPTIMA — Confidencialidad.', body: CONFIDENTIALITY_CLAUSE('EL CONTRATISTA') },
      { heading: 'OCTAVA — Tratamiento de datos personales.', body: DATA_PROTECTION_CLAUSE('EL CONTRATISTA') },
      { heading: 'NOVENA — Naturaleza del contrato.', body: 'Las partes declaran expresamente que el presente contrato es de naturaleza civil y no laboral, y que en ningún caso podrá interpretarse como generador de un contrato de trabajo, en tanto no concurren los elementos de subordinación continuada propios de este.' },
    ],
    signatureBlock: [
      { role: 'EL CONTRATANTE', name: p.managerName, idLabel: 'NIT', idValue: p.companyNit },
      { role: 'EL CONTRATISTA', name: employee.name, idLabel: p.docLabel, idValue: employee.documentNumber },
    ],
  };
}

function buildSubcontratistaNatural({ employee, company, project, doc }) {
  const p = partiesBlock({ employee, company });
  return {
    documentTitle: 'CONTRATO DE SUBCONTRATACIÓN — PERSONA NATURAL',
    intro: `Entre ${p.companyName}, NIT ${p.companyNit}, representada legalmente por ${p.managerName} (en adelante "EL CONTRATANTE"), y ${employee.name}, identificado(a) con ${p.docLabel} No. ${employee.documentNumber}, domiciliado(a) en ${employee.address}, ${employee.city} (en adelante "EL SUBCONTRATISTA"), se celebra el presente Contrato de Subcontratación.`,
    clauses: [
      { heading: 'PRIMERA — Objeto.', body: `EL SUBCONTRATISTA se obliga a ejecutar, de manera independiente y con sus propios medios, la siguiente labor dentro del proyecto ${project.name}: "${doc.objectAtIssue}".` },
      { heading: 'SEGUNDA — Independencia.', body: 'EL SUBCONTRATISTA actúa como contratista independiente, sin subordinación laboral frente a EL CONTRATANTE, asumiendo bajo su propia responsabilidad los riesgos derivados de la ejecución del objeto contratado.' },
      { heading: 'TERCERA — Duración.', body: `Del ${formatDateEs(doc.effectiveFrom)} al ${formatDateEs(doc.effectiveTo)}.` },
      { heading: 'CUARTA — Valor y forma de pago.', body: `EL CONTRATANTE pagará a EL SUBCONTRATISTA la suma de ${money(doc.valueAtIssue)}, contra cuenta de cobro o factura y verificación de la afiliación vigente a que se refiere la cláusula quinta.` },
      { heading: 'QUINTA — Afiliación obligatoria a riesgos laborales.', body: `De conformidad con el artículo 2 de la Ley 1562 de 2012 y el Decreto 1072 de 2015, EL SUBCONTRATISTA se obliga a afiliarse y mantenerse afiliado, por su cuenta y riesgo, a la ARL ${employee.arlName} durante toda la ejecución del contrato${employee.epsName ? `, así como a la EPS ${employee.epsName}` : ''}${employee.pensionFundName ? ` y al fondo de pensiones ${employee.pensionFundName}` : ''} como trabajador independiente. EL CONTRATANTE verificará dicha afiliación antes del inicio de actividades.` },
      { heading: 'SEXTA — Obligaciones de EL SUBCONTRATISTA.', body: 'Ejecutar la labor con sus propios medios bajo su exclusiva responsabilidad, cumplir las normas de seguridad y salud en el trabajo aplicables a la obra, y mantener vigente su afiliación a riesgos laborales y seguridad social.' },
      { heading: 'SÉPTIMA — Confidencialidad.', body: CONFIDENTIALITY_CLAUSE('EL SUBCONTRATISTA') },
      { heading: 'OCTAVA — Tratamiento de datos personales.', body: DATA_PROTECTION_CLAUSE('EL SUBCONTRATISTA') },
      { heading: 'NOVENA — Terminación.', body: 'Por vencimiento del plazo pactado, mutuo acuerdo, incumplimiento de las obligaciones de cualquiera de las partes, o terminación unilateral con un preaviso de treinta (30) días.' },
      { heading: 'DÉCIMA — Naturaleza del contrato.', body: 'Las partes declaran que el presente es un contrato de naturaleza civil/comercial y no laboral, sin subordinación continuada.' },
    ],
    signatureBlock: [
      { role: 'EL CONTRATANTE', name: p.managerName, idLabel: 'NIT', idValue: p.companyNit },
      { role: 'EL SUBCONTRATISTA', name: employee.name, idLabel: p.docLabel, idValue: employee.documentNumber },
    ],
  };
}

function buildSubcontratistaJuridica({ employee, company, project, doc }) {
  const p = partiesBlock({ employee, company });
  return {
    documentTitle: 'CONTRATO DE SUBCONTRATACIÓN — PERSONA JURÍDICA',
    intro: `Entre ${p.companyName}, NIT ${p.companyNit}, representada legalmente por ${p.managerName} (en adelante "EL CONTRATANTE"), y ${employee.subcontractorLegalName}, sociedad identificada con NIT ${employee.subcontractorNit}, representada legalmente por ${employee.subcontractorLegalRep}, identificado(a) con ${p.docLabel} No. ${employee.documentNumber} (en adelante "EL SUBCONTRATISTA"), se celebra el presente Contrato de Subcontratación.`,
    clauses: [
      { heading: 'PRIMERA — Objeto.', body: `EL SUBCONTRATISTA se obliga a ejecutar, con su propio personal, equipos y medios, la siguiente labor dentro del proyecto ${project.name}: "${doc.objectAtIssue}".` },
      { heading: 'SEGUNDA — Independencia y personal a cargo.', body: 'EL SUBCONTRATISTA ejecutará el objeto contratado con autonomía técnica y administrativa, con personal vinculado laboralmente por él mismo, sin que se genere ningún tipo de relación laboral, directa ni indirecta, entre dicho personal y EL CONTRATANTE.' },
      { heading: 'TERCERA — Duración.', body: `Del ${formatDateEs(doc.effectiveFrom)} al ${formatDateEs(doc.effectiveTo)}.` },
      { heading: 'CUARTA — Valor y forma de pago.', body: `EL CONTRATANTE pagará a EL SUBCONTRATISTA la suma de ${money(doc.valueAtIssue)}, contra factura y los soportes de cumplimiento de las obligaciones de la cláusula quinta.` },
      { heading: 'QUINTA — Obligaciones laborales y de seguridad social de EL SUBCONTRATISTA.', body: 'EL SUBCONTRATISTA es el único responsable del cumplimiento de las obligaciones laborales, prestacionales y de seguridad social integral de su personal, debiendo acreditarlo a EL CONTRATANTE cuando este lo requiera, de conformidad con el artículo 34 del CST (responsabilidad solidaria del contratante frente a las obligaciones laborales del subcontratista respecto de sus propios trabajadores).' },
      { heading: 'SEXTA — Garantías.', body: 'EL SUBCONTRATISTA se obliga a constituir a favor de EL CONTRATANTE las pólizas de cumplimiento, responsabilidad civil extracontractual y de salarios y prestaciones sociales que EL CONTRATANTE le indique, vigentes durante la ejecución del contrato.' },
      { heading: 'SÉPTIMA — Responsabilidad e indemnidad.', body: 'EL SUBCONTRATISTA mantendrá indemne a EL CONTRATANTE frente a cualquier reclamación laboral, administrativa o judicial que llegaren a interponer sus trabajadores o terceros con ocasión de la ejecución de este contrato.' },
      { heading: 'OCTAVA — Confidencialidad.', body: CONFIDENTIALITY_CLAUSE('EL SUBCONTRATISTA') },
      { heading: 'NOVENA — Tratamiento de datos personales.', body: 'EL SUBCONTRATISTA autoriza el tratamiento de los datos de su representante legal para efectos de la gestión de este contrato, conforme a la Ley 1581 de 2012.' },
      { heading: 'DÉCIMA — Terminación.', body: 'Por vencimiento del plazo pactado, mutuo acuerdo, incumplimiento de las obligaciones de cualquiera de las partes, o terminación unilateral con un preaviso de treinta (30) días.' },
    ],
    signatureBlock: [
      { role: 'EL CONTRATANTE', name: p.managerName, idLabel: 'NIT', idValue: p.companyNit },
      { role: 'EL SUBCONTRATISTA', name: employee.subcontractorLegalRep, idLabel: 'NIT', idValue: `${employee.subcontractorNit} — ${employee.subcontractorLegalName}` },
    ],
  };
}

const BUILDERS = {
  obra_labor: buildObraLabor,
  termino_fijo: (ctx) => buildTerminoFijoOIndefinido(ctx, false),
  termino_indefinido: (ctx) => buildTerminoFijoOIndefinido(ctx, true),
  aprendizaje: buildAprendizaje,
  prestacion_servicios: buildPrestacionServicios,
  subcontratista_natural: buildSubcontratistaNatural,
  subcontratista_juridica: buildSubcontratistaJuridica,
};

// ctx: { employee, company, project, doc } donde doc es el EmployeeContractDocument recién creado
// (kind='contrato') o, para el otrosí, { ...doc, parent } + changes con los campos que cambiaron.
function buildContractContent(ctx) {
  if (ctx.doc.kind === 'otrosi') return buildOtrosi(ctx);
  const builder = BUILDERS[ctx.doc.contractType];
  if (!builder) throw new Error(`Tipo de contrato desconocido: ${ctx.doc.contractType}`);
  return builder(ctx);
}

module.exports = {
  CONTRACT_TYPE_LABELS,
  REQUIRED_FIELDS_BY_TYPE,
  missingFieldsForContract,
  buildContractContent,
  formatDateEs,
  money,
};
