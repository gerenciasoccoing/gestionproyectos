import { Fragment, useEffect, useState } from 'react';
import { useOutletContext, useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { employeeContractsApi, cashBoxesApi, laborParamsApi, leaveTypesApi } from '../../api';
import { buildEmployeeApi } from './employeeApiFactory';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import ProviderSelect from '../../components/ProviderSelect';
import ContractValueHelper from '../../components/ContractValueHelper';
import useSubmitGuard from '../../hooks/useSubmitGuard';

// Atiende tanto /projects/:projectId/personnel/:employeeId (useOutletContext trae projectId/project)
// como /personnel/:employeeId (menú principal, sin ese contexto) — mismo registro, misma ficha, ver
// el comentario al inicio de employeeController.js en el backend. api (buildEmployeeApi) reemplaza
// projectId como lo que se pasa hacia las secciones: ya resuelve sola la ruta correcta.
export default function EmployeeDetailPage() {
  const { t } = useTranslation();
  const outletCtx = useOutletContext();
  const projectId = outletCtx?.projectId;
  const project = outletCtx?.project;
  const isGeneral = !projectId;
  const api = buildEmployeeApi(projectId);
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const load = () => api.employees.get(employeeId).then(setEmployee);
  useEffect(() => { load(); }, [projectId, employeeId]);

  const remove = async () => {
    if (!window.confirm(t('personnel.detail.deleteConfirm', { name: employee.name }))) return;
    setDeleteError('');
    try {
      await api.employees.remove(employee.id);
      navigate(isGeneral ? '/personnel' : '../personnel');
    } catch (err) {
      setDeleteError(extractError(err));
    }
  };

  if (!employee) return <div className="text-gray-500">{t('common.loading')}</div>;

  return (
    <div>
      <Link to={isGeneral ? '/personnel' : '../personnel'} className="text-sm text-blue-600 hover:underline">{t('personnel.detail.back')}</Link>
      <div className="flex items-center gap-3 mt-2 mb-4">
        <h2 className="text-lg font-bold">{employee.name}</h2>
        <Badge color={employee.status === 'activo' ? 'green' : 'gray'}>{t(`personnel.list.status.${employee.status}`, employee.status)}</Badge>
        {isGeneral && (
          <Badge color={employee.projectId ? 'gray' : 'blue'}>
            {employee.projectId ? `${t('personnel.list.vinculacion.proyecto')}${employee.Project ? ` — ${employee.Project.name}` : ''}` : t('personnel.list.vinculacion.administrativo')}
          </Badge>
        )}
        <Can module="personal" action="delete">
          <Button variant="danger" className="ml-auto" onClick={remove}>{t('personnel.detail.delete')}</Button>
        </Can>
      </div>
      <ErrorText>{deleteError}</ErrorText>

      <BasicDataSection api={api} employee={employee} onChange={load} />
      <ContractsSection api={api} project={project} employee={employee} onChange={load} />
      <SocialSecuritySection api={api} employee={employee} onChange={load} />
      {IS_NOMINA_ELIGIBLE(employee.contractType) ? (
        <LeavesSection api={api} employee={employee} />
      ) : (
        <Card title={t('personnel.detail.leaves.title')}>
          <p className="text-sm text-gray-500">{t('personnel.detail.payments.notEligible')}</p>
        </Card>
      )}
      {IS_NOMINA_ELIGIBLE(employee.contractType) ? (
        <DeductionsSection api={api} employee={employee} />
      ) : (
        <Card title={t('personnel.detail.deductions.title')}>
          <p className="text-sm text-gray-500">{t('personnel.detail.payments.notEligible')}</p>
        </Card>
      )}
      {IS_NOMINA_ELIGIBLE(employee.contractType) ? (
        <PaymentsSection api={api} employee={employee} onChange={load} />
      ) : (
        <Card title={t('personnel.detail.payments.title')}>
          <p className="text-sm text-gray-500">{t('personnel.detail.payments.notEligible')}</p>
        </Card>
      )}
      {IS_LABORAL(employee.contractType) ? (
        employee.status === 'activo' ? (
          <SeveranceSection api={api} employee={employee} onChange={load} />
        ) : (
          <SeveranceSummary api={api} employee={employee} onChange={load} />
        )
      ) : (
        <Card title={t('personnel.detail.severance.title')}>
          <p className="text-sm text-gray-500">{t('personnel.detail.severance.notEligible')}</p>
        </Card>
      )}
    </div>
  );
}

const NEEDS_END_DATE = new Set(['termino_fijo', 'aprendizaje', 'prestacion_servicios', 'subcontratista_natural', 'subcontratista_juridica']);
const IS_SUBCONTRATISTA_JURIDICA = (t) => t === 'subcontratista_juridica';
const IS_LABORAL = (t) => ['obra_labor', 'termino_fijo', 'termino_indefinido'].includes(t);
// Nómina (salario mensual + posible auxilio de transporte) sí aplica a aprendizaje (apoyo de
// sostenimiento mensual) además de los contratos laborales — pero NO a prestación de servicios ni
// subcontratación, cuyo salaryValue es el valor TOTAL del contrato/honorarios, no mensual. Ver
// NOMINA_ELIGIBLE_TYPES en backend/contractTemplates.js para el detalle legal completo.
const IS_NOMINA_ELIGIBLE = (t) => IS_LABORAL(t) || t === 'aprendizaje';
// Para estos tipos, salaryValue YA es el valor total del contrato: el campo se etiqueta distinto y
// no tiene sentido calcularle "valor total = salario x días" (ver ContractValueHelper más abajo).
const IS_TOTAL_CONTRACT_VALUE = (t) => ['prestacion_servicios', 'subcontratista_natural', 'subcontratista_juridica'].includes(t);

function BasicDataSection({ api, employee, onChange }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [cedulaFile, setCedulaFile] = useState(null);
  const [contractTypes, setContractTypes] = useState([]);
  const [laborParams, setLaborParams] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { employeeContractsApi.contractTypes().then(setContractTypes); }, []);
  useEffect(() => { laborParamsApi.current().then(setLaborParams).catch(() => {}); }, []);

  const startEdit = () => {
    setForm({
      name: employee.name || '', entryDate: employee.entryDate || '',
      position: employee.position || '', salaryValue: employee.salaryValue || '', dedicationHours: employee.dedicationHours || '',
      documentType: employee.documentType || '', documentNumber: employee.documentNumber || '',
      address: employee.address || '', city: employee.city || '', phone: employee.phone || '', email: employee.email || '', nationality: employee.nationality || 'Colombiana',
      contractType: employee.contractType || '', contractObject: employee.contractObject || '', contractEndDate: employee.contractEndDate || '',
      epsName: employee.epsName || '', pensionFundName: employee.pensionFundName || '', arlName: employee.arlName || '',
      subcontractorLegalName: employee.subcontractorLegalName || '', subcontractorNit: employee.subcontractorNit || '', subcontractorLegalRep: employee.subcontractorLegalRep || '',
    });
    setError('');
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.employees.update(employee.id, form);
      if (cedulaFile) {
        const fd = new FormData();
        fd.append('file', cedulaFile);
        await api.employees.uploadCedula(employee.id, fd);
        setCedulaFile(null);
      }
      setEditing(false);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const contractTypeLabel = contractTypes.find((ct) => ct.value === employee.contractType)?.label;

  return (
    <Card title={t('personnel.detail.basicData')} actions={
      <Can module="personal" action="edit">
        <Button variant="secondary" onClick={() => (editing ? setEditing(false) : startEdit())}>
          {editing ? t('common.cancel') : t('common.edit')}
        </Button>
      </Can>
    }>
      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div><span className="text-gray-500">{t('personnel.detail.position')}:</span> {employee.position}</div>
          <div><span className="text-gray-500">{t('personnel.detail.entry')}:</span> {formatDate(employee.entryDate)}</div>
          <div><span className="text-gray-500">{t('personnel.detail.exit')}:</span> {formatDate(employee.exitDate) || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.salary')}:</span> {money(employee.salaryValue)}</div>
          <div><span className="text-gray-500">{t('personnel.detail.dedication')}:</span> {employee.dedicationHours || '-'} h</div>
          <div><span className="text-gray-500">{t('personnel.detail.contract')}:</span> {employee.contractFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(employee.contractFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</div>
          <div><span className="text-gray-500">{t('personnel.contract.type')}:</span> {contractTypeLabel || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.documentType')}:</span> {employee.documentType ? `${employee.documentType} ${employee.documentNumber || ''}` : '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.address')}:</span> {employee.address || '-'}{employee.city ? `, ${employee.city}` : ''}</div>
          <div><span className="text-gray-500">{t('personnel.detail.phone')}:</span> {employee.phone || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.email')}:</span> {employee.email || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.nationality')}:</span> {employee.nationality || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.eps')}:</span> {employee.epsName || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.pensionFund')}:</span> {employee.pensionFundName || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.arl')}:</span> {employee.arlName || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.cedula')}:</span> {employee.cedulaFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(employee.cedulaFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</div>
          {IS_SUBCONTRATISTA_JURIDICA(employee.contractType) && (
            <>
              <div><span className="text-gray-500">{t('personnel.contract.subcontractorLegalName')}:</span> {employee.subcontractorLegalName || '-'}</div>
              <div><span className="text-gray-500">{t('personnel.contract.subcontractorNit')}:</span> {employee.subcontractorNit || '-'}</div>
              <div><span className="text-gray-500">{t('personnel.contract.subcontractorLegalRep')}:</span> {employee.subcontractorLegalRep || '-'}</div>
            </>
          )}
          {employee.contractObject && <div className="col-span-full"><span className="text-gray-500">{t('personnel.contract.object')}:</span> {employee.contractObject}</div>}
        </div>
      ) : (
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label={t('personnel.list.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('personnel.list.entryDate')} type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required />
          <Input label={t('personnel.detail.position')} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <Input
            label={IS_TOTAL_CONTRACT_VALUE(form.contractType) ? t('personnel.list.totalContractValue') : t('personnel.list.salaryBase')}
            type="number" min="0" step="0.01" value={form.salaryValue} onChange={(e) => setForm({ ...form, salaryValue: e.target.value })}
          />
          <Input label={t('personnel.detail.dedication')} type="number" min="0" step="0.01" value={form.dedicationHours} onChange={(e) => setForm({ ...form, dedicationHours: e.target.value })} />
          <ContractValueHelper
            laborParams={laborParams}
            previewFn={(data) => api.employees.previewContractValue(data)}
            salaryValue={form.salaryValue}
            entryDate={form.entryDate}
            contractEndDate={form.contractEndDate}
            showRange={NEEDS_END_DATE.has(form.contractType) && IS_NOMINA_ELIGIBLE(form.contractType)}
          />

          <Select label={t('personnel.contract.type')} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
            <option value="">{t('personnel.contract.selectType')}</option>
            {contractTypes.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </Select>
          <Select label={t('personnel.detail.documentType')} value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
            <option value="">-</option>
            <option value="CC">{t('personnel.detail.documentTypes.CC')}</option>
            <option value="CE">{t('personnel.detail.documentTypes.CE')}</option>
            <option value="PASAPORTE">{t('personnel.detail.documentTypes.PASAPORTE')}</option>
            <option value="PEP">{t('personnel.detail.documentTypes.PEP')}</option>
          </Select>
          <Input label={t('personnel.detail.documentNumber')} value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} />

          <Input label={t('personnel.detail.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label={t('personnel.detail.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label={t('personnel.detail.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t('personnel.detail.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('personnel.detail.emailPlaceholder')} />
          <Input label={t('personnel.detail.nationality')} value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />

          <Input label={t('personnel.contract.object')} value={form.contractObject} onChange={(e) => setForm({ ...form, contractObject: e.target.value })} className="lg:col-span-2" />
          {NEEDS_END_DATE.has(form.contractType) && (
            <Input label={t('personnel.contract.endDate')} type="date" value={form.contractEndDate} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} />
          )}

          {(IS_LABORAL(form.contractType) || form.contractType === 'aprendizaje') && (
            <>
              <ProviderSelect type="eps" label={t('personnel.detail.eps')} value={form.epsName} onChange={(v) => setForm({ ...form, epsName: v })} />
              {form.contractType !== 'aprendizaje' && (
                <ProviderSelect type="pension" label={t('personnel.detail.pensionFund')} value={form.pensionFundName} onChange={(v) => setForm({ ...form, pensionFundName: v })} />
              )}
              <ProviderSelect type="arl" label={t('personnel.detail.arl')} value={form.arlName} onChange={(v) => setForm({ ...form, arlName: v })} />
            </>
          )}
          {form.contractType === 'subcontratista_natural' && (
            <ProviderSelect type="arl" label={t('personnel.detail.arl')} value={form.arlName} onChange={(v) => setForm({ ...form, arlName: v })} />
          )}

          {IS_SUBCONTRATISTA_JURIDICA(form.contractType) && (
            <>
              <Input label={t('personnel.contract.subcontractorLegalName')} value={form.subcontractorLegalName} onChange={(e) => setForm({ ...form, subcontractorLegalName: e.target.value })} />
              <Input label={t('personnel.contract.subcontractorNit')} value={form.subcontractorNit} onChange={(e) => setForm({ ...form, subcontractorNit: e.target.value })} />
              <Input label={t('personnel.contract.subcontractorLegalRep')} value={form.subcontractorLegalRep} onChange={(e) => setForm({ ...form, subcontractorLegalRep: e.target.value })} />
            </>
          )}

          <Input label={t('personnel.detail.cedula')} type="file" onChange={(e) => setCedulaFile(e.target.files[0])} />

          <Button type="submit" className="col-span-full">{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
    </Card>
  );
}

function ContractsSection({ api, project, employee, onChange }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState([]);
  const [contractTypes, setContractTypes] = useState([]);
  const [error, setError] = useState('');
  const [missingFields, setMissingFields] = useState([]);
  const [otrosiForm, setOtrosiForm] = useState({ newContractObject: '', newEndDate: '', newSalaryValue: '' });
  const [showOtrosi, setShowOtrosi] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [sendingSignatureId, setSendingSignatureId] = useState(null);
  const [signatureNotes, setSignatureNotes] = useState({});

  const load = () => api.contracts.list(employee.id).then(setDocs);
  useEffect(() => { load(); }, [employee.id]);
  useEffect(() => { employeeContractsApi.contractTypes().then(setContractTypes); }, []);

  const typeLabel = (value) => contractTypes.find((ct) => ct.value === value)?.label || value;

  const [generate, generating] = useSubmitGuard(async () => {
    setError(''); setMissingFields([]);
    try {
      await api.contracts.generate(employee.id);
      load();
    } catch (err) {
      setError(extractError(err));
      setMissingFields(err?.response?.data?.details?.missingFields || []);
    }
  });

  const [submitOtrosi, submittingOtrosi] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    const last = docs[docs.length - 1];
    if (!last) return;
    try {
      const payload = {};
      if (otrosiForm.newContractObject) payload.newContractObject = otrosiForm.newContractObject;
      if (otrosiForm.newEndDate) payload.newEndDate = otrosiForm.newEndDate;
      if (otrosiForm.newSalaryValue) payload.newSalaryValue = otrosiForm.newSalaryValue;
      await api.contracts.generateOtrosi(employee.id, last.id, payload);
      setOtrosiForm({ newContractObject: '', newEndDate: '', newSalaryValue: '' });
      setShowOtrosi(false);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const sendSignature = async (doc) => {
    setSendingSignatureId(doc.id);
    setSignatureNotes((n) => ({ ...n, [doc.id]: null }));
    try {
      const res = await api.contracts.requestSignature(employee.id, doc.id);
      setSignatureNotes((n) => ({
        ...n,
        [doc.id]: res.emailSent
          ? { text: t('personnel.contract.signatureSent'), isError: false }
          : { text: t('personnel.contract.signatureEmailFailed', { link: res.signUrl }), isError: true, link: res.signUrl },
      }));
      load();
    } catch (err) {
      setSignatureNotes((n) => ({ ...n, [doc.id]: { text: extractError(err), isError: true } }));
    } finally {
      setSendingSignatureId(null);
    }
  };

  const removeDoc = async (doc) => {
    if (!window.confirm(t('personnel.contract.confirmDelete'))) return;
    setError('');
    setDeletingId(doc.id);
    try {
      await api.contracts.remove(employee.id, doc.id);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card title={t('personnel.contract.title')} actions={
      <Can module="personal" action="edit">
        <div className="flex gap-2">
          {employee.contractType === 'obra_labor' && docs.length > 0 && (
            <Button variant="secondary" onClick={() => setShowOtrosi((s) => !s)}>{showOtrosi ? t('common.cancel') : t('personnel.contract.newOtrosi')}</Button>
          )}
          <Button onClick={generate} loading={generating}>{generating ? t('personnel.contract.generating') : t('personnel.contract.generate')}</Button>
        </div>
      </Can>
    }>
      <ErrorText>{error}</ErrorText>
      {missingFields.length > 0 && (
        <p className="text-sm text-yellow-700 mb-2">{t('personnel.contract.missingFields')}: {missingFields.join(', ')}</p>
      )}
      {employee.projectId && !project?.contractNumber && (
        <p className="text-xs text-yellow-700 mb-2">{t('contractual.contractNumber.warning')}</p>
      )}
      {showOtrosi && (
        <form onSubmit={submitOtrosi} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 items-end border-b pb-3">
          <Input label={t('personnel.contract.newObject')} value={otrosiForm.newContractObject} onChange={(e) => setOtrosiForm({ ...otrosiForm, newContractObject: e.target.value })} />
          <Input label={t('personnel.contract.newEndDate')} type="date" value={otrosiForm.newEndDate} onChange={(e) => setOtrosiForm({ ...otrosiForm, newEndDate: e.target.value })} />
          <Input label={t('personnel.contract.newValue')} type="number" min="0" step="0.01" value={otrosiForm.newSalaryValue} onChange={(e) => setOtrosiForm({ ...otrosiForm, newSalaryValue: e.target.value })} />
          <Button type="submit" loading={submittingOtrosi}>{t('personnel.contract.generateOtrosi')}</Button>
        </form>
      )}
      <Table columns={[t('personnel.contract.table.type'), t('personnel.contract.table.number'), t('personnel.contract.table.from'), t('personnel.contract.table.to'), t('personnel.contract.table.value'), t('personnel.contract.table.pdf'), t('personnel.contract.table.docx'), t('personnel.contract.table.signature'), '']}>
        {docs.map((d) => (
          <Fragment key={d.id}>
            <tr className="border-b border-gray-100 align-top">
              <td className="py-1 pr-3">{d.kind === 'otrosi' ? `${t('personnel.contract.otrosiLabel')} ${d.sequenceNumber}` : typeLabel(d.contractType)}</td>
              <td className="py-1 pr-3">{d.contractPrefix ? `${d.contractPrefix}-${d.sequenceNumber}` : d.sequenceNumber}</td>
              <td className="py-1 pr-3">{formatDate(d.effectiveFrom) || '-'}</td>
              <td className="py-1 pr-3">{formatDate(d.effectiveTo) || '-'}</td>
              <td className="py-1 pr-3">{money(d.valueAtIssue)}</td>
              <td className="py-1 pr-3">{d.pdfFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(d.pdfFilePath)} target="_blank" rel="noreferrer">PDF</a> : '-'}</td>
              <td className="py-1 pr-3">{d.docxFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(d.docxFilePath)} target="_blank" rel="noreferrer">Word</a> : '-'}</td>
              <td className="py-1 pr-3">
                {d.signatureStatus === 'firmado' ? (
                  <div className="flex flex-col gap-1">
                    <Badge color="green">{t('personnel.contract.signatureStatus.firmado')}</Badge>
                    {d.signedPdfFilePath && (
                      <a className="text-blue-600 hover:underline text-xs" href={fileUrl(d.signedPdfFilePath)} target="_blank" rel="noreferrer">{t('personnel.contract.viewSigned')}</a>
                    )}
                  </div>
                ) : d.signatureStatus === 'pendiente' ? (
                  <Badge color="yellow">{t('personnel.contract.signatureStatus.pendiente')}</Badge>
                ) : (
                  <Badge>{t('personnel.contract.signatureStatus.no_solicitado')}</Badge>
                )}
              </td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <Can module="personal" action="edit">
                  {d.signatureStatus !== 'firmado' && d.pdfFilePath && (
                    <Button variant="secondary" loading={sendingSignatureId === d.id} onClick={() => sendSignature(d)}>
                      {d.signatureStatus === 'pendiente' ? t('personnel.contract.resendSignature') : t('personnel.contract.sendSignature')}
                    </Button>
                  )}
                </Can>
                <Can module="personal" action="delete">
                  <Button variant="danger" className="ml-2" loading={deletingId === d.id} onClick={() => removeDoc(d)}>{t('common.delete')}</Button>
                </Can>
              </td>
            </tr>
            {signatureNotes[d.id] && (
              <tr key={`${d.id}-note`} className="border-b border-gray-100 bg-gray-50">
                <td colSpan={9} className={`py-1 px-3 text-xs ${signatureNotes[d.id].isError ? 'text-yellow-700' : 'text-green-700'}`}>
                  {signatureNotes[d.id].text}
                  {signatureNotes[d.id].link && (
                    <button
                      type="button"
                      className="ml-2 text-blue-600 hover:underline"
                      onClick={() => navigator.clipboard?.writeText(signatureNotes[d.id].link)}
                    >
                      {t('personnel.contract.copyLink')}
                    </button>
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
        {docs.length === 0 && <tr><td colSpan={8} className="py-2 text-center text-gray-400">{t('personnel.contract.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

function SocialSecuritySection({ api, employee, onChange }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ type: 'salud', uploadDate: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError(t('personnel.detail.socialSecurity.missingFile')); return; }
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('uploadDate', form.uploadDate || new Date().toISOString().slice(0, 10));
      fd.append('file', file);
      await api.employees.addSocialSecurity(employee.id, fd);
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('personnel.detail.socialSecurity.title')}>
      <Can module="personal" action="edit">
        <form onSubmit={submit} className="flex flex-wrap gap-3 items-end mb-3">
          <Select label={t('personnel.detail.socialSecurity.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="salud">{t('personnel.detail.socialSecurity.types.salud')}</option>
            <option value="arl">{t('personnel.detail.socialSecurity.types.arl')}</option>
            <option value="pension">{t('personnel.detail.socialSecurity.types.pension')}</option>
          </Select>
          <Input label={t('personnel.detail.socialSecurity.date')} type="date" value={form.uploadDate} onChange={(e) => setForm({ ...form, uploadDate: e.target.value })} />
          <Input label={t('personnel.detail.socialSecurity.file')} type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <Button type="submit" loading={submitting}>{t('personnel.detail.socialSecurity.attach')}</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Can>
      <Table columns={[t('personnel.detail.socialSecurity.table.type'), t('personnel.detail.socialSecurity.table.date'), t('personnel.detail.socialSecurity.table.file')]}>
        {employee.socialSecurityDocuments?.map((d) => (
          <tr key={d.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{t(`personnel.detail.socialSecurity.types.${d.type}`, d.type)}</td>
            <td className="py-1 pr-3">{formatDate(d.uploadDate)}</td>
            <td className="py-1 pr-3"><a className="text-blue-600 hover:underline" href={fileUrl(d.filePath)} target="_blank" rel="noreferrer">{t('common.view')}</a></td>
          </tr>
        ))}
        {(!employee.socialSecurityDocuments || employee.socialSecurityDocuments.length === 0) && (
          <tr><td colSpan={3} className="py-2 text-center text-gray-400">{t('personnel.detail.socialSecurity.empty')}</td></tr>
        )}
      </Table>
    </Card>
  );
}

const LEAVE_TYPES = ['incapacidad_general', 'incapacidad_laboral', 'vacaciones', 'licencia_remunerada', 'licencia_no_remunerada'];
const IS_INCAPACIDAD = (type) => type === 'incapacidad_general' || type === 'incapacidad_laboral';

const emptyLeaveForm = { type: '', startDate: '', endDate: '', leaveTypeId: '', parentLeaveId: '', notes: '' };

// Novedades de nómina (incapacidades, vacaciones, licencias) — ver EmployeeLeave.js y
// laborCalculations.js en el backend para cómo afectan el cálculo de un período (días no
// trabajados, split empleador/EPS/ARL de una incapacidad, etc.). Solo se muestra para contratos con
// nómina (mismo gate que PaymentsSection): un contrato civil no tiene incapacidades/vacaciones de
// Ley que registrar acá.
function LeavesSection({ api, employee }) {
  const { t } = useTranslation();
  const [leaves, setLeaves] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balance, setBalance] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyLeaveForm);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    api.leaves.list(employee.id).then(setLeaves);
    api.leaves.vacationBalance(employee.id).then(setBalance);
  };
  useEffect(() => { load(); }, [employee.id]);
  useEffect(() => { leaveTypesApi.list().then(setLeaveTypes); }, []);

  const activeLeaveTypes = leaveTypes.filter((lt) => lt.active);
  const incapacidadOptions = leaves.filter((l) => IS_INCAPACIDAD(l.type));

  const startCreate = () => { setForm(emptyLeaveForm); setFile(null); setError(''); setShowForm(true); };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('startDate', form.startDate);
      fd.append('endDate', form.endDate);
      if (form.type === 'licencia_remunerada' && form.leaveTypeId) fd.append('leaveTypeId', form.leaveTypeId);
      if (IS_INCAPACIDAD(form.type) && form.parentLeaveId) fd.append('parentLeaveId', form.parentLeaveId);
      if (form.notes) fd.append('notes', form.notes);
      if (file) fd.append('file', file);
      await api.leaves.create(employee.id, fd);
      setForm(emptyLeaveForm);
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (leave) => {
    if (!window.confirm(t('personnel.detail.leaves.confirmDelete'))) return;
    setError('');
    setDeletingId(leave.id);
    try {
      await api.leaves.remove(employee.id, leave.id);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card title={t('personnel.detail.leaves.title')} actions={
      <Can module="personal" action="edit">
        <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? t('common.cancel') : t('personnel.detail.leaves.newLeave')}
        </Button>
      </Can>
    }>
      {balance && (
        <div className="flex flex-wrap gap-4 text-sm mb-3 bg-gray-50 border border-gray-200 rounded px-3 py-2">
          <span>{t('personnel.detail.leaves.balance.accrued')}: <strong>{balance.accruedDays}</strong></span>
          <span>{t('personnel.detail.leaves.balance.taken')}: <strong>{balance.takenDays}</strong></span>
          <span>{t('personnel.detail.leaves.balance.pending')}: <strong>{balance.pendingDays}</strong></span>
        </div>
      )}
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 items-end">
          <Select label={t('personnel.detail.leaves.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, leaveTypeId: '', parentLeaveId: '' })} required>
            <option value="">{t('common.selectPlaceholder')}</option>
            {LEAVE_TYPES.map((lt) => <option key={lt} value={lt}>{t(`personnel.detail.leaves.types.${lt}`)}</option>)}
          </Select>
          <Input label={t('personnel.detail.leaves.startDate')} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
          <Input label={t('personnel.detail.leaves.endDate')} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          {form.type === 'licencia_remunerada' && (
            <Select label={t('personnel.detail.leaves.leaveType')} value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {activeLeaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </Select>
          )}
          {IS_INCAPACIDAD(form.type) && (
            <Select label={t('personnel.detail.leaves.parentLeave')} value={form.parentLeaveId} onChange={(e) => setForm({ ...form, parentLeaveId: e.target.value })}>
              <option value="">{t('personnel.detail.leaves.parentLeaveNone')}</option>
              {incapacidadOptions.map((l) => (
                <option key={l.id} value={l.id}>{t(`personnel.detail.leaves.types.${l.type}`)} {formatDate(l.startDate)} - {formatDate(l.endDate)}</option>
              ))}
            </Select>
          )}
          <Input label={t('personnel.detail.leaves.support')} type="file" onChange={(e) => setFile(e.target.files[0])} />
          <Input label={t('personnel.detail.leaves.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="lg:col-span-2" />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      {!showForm && <ErrorText>{error}</ErrorText>}
      <Table columns={[t('personnel.detail.leaves.table.type'), t('personnel.detail.leaves.table.startDate'), t('personnel.detail.leaves.table.endDate'), t('personnel.detail.leaves.table.leaveType'), t('personnel.detail.leaves.table.support'), '']}>
        {leaves.map((l) => (
          <tr key={l.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{t(`personnel.detail.leaves.types.${l.type}`)}</td>
            <td className="py-1 pr-3">{formatDate(l.startDate)}</td>
            <td className="py-1 pr-3">{formatDate(l.endDate)}</td>
            <td className="py-1 pr-3">{l.LeaveType?.name || '-'}</td>
            <td className="py-1 pr-3">{l.supportFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(l.supportFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Can module="personal" action="delete">
                <Button variant="danger" loading={deletingId === l.id} onClick={() => remove(l)}>{t('common.delete')}</Button>
              </Can>
            </td>
          </tr>
        ))}
        {leaves.length === 0 && <tr><td colSpan={6} className="py-2 text-center text-gray-400">{t('personnel.detail.leaves.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

const DEDUCTION_TYPES = ['prestamo', 'libranza', 'embargo', 'otro'];
const REQUIRES_AUTHORIZATION_FILE = (type) => type === 'prestamo' || type === 'libranza' || type === 'otro';

const emptyDeductionForm = { type: '', concept: '', embargoKind: '', totalAmount: '', installmentAmount: '', startDate: '', notes: '' };

// Otros descuentos de nómina (préstamos/anticipos, libranzas, embargos judiciales, otros
// descuentos autorizados) — ver EmployeeDeduction.js y laborCalculations.js#computeOtherDeductions
// en el backend para cómo se aplican y, en el caso de un embargo, cómo se limita al tope legal.
// Mismo gate que Novedades/Nómina: un contrato civil no tiene estas figuras.
function DeductionsSection({ api, employee }) {
  const { t } = useTranslation();
  const [deductions, setDeductions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyDeductionForm);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => api.deductions.list(employee.id).then(setDeductions);
  useEffect(() => { load(); }, [employee.id]);

  const startCreate = () => { setForm(emptyDeductionForm); setFile(null); setError(''); setShowForm(true); };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('concept', form.concept);
      if (form.type === 'embargo') fd.append('embargoKind', form.embargoKind);
      if (form.totalAmount) fd.append('totalAmount', form.totalAmount);
      fd.append('installmentAmount', form.installmentAmount);
      if (form.startDate) fd.append('startDate', form.startDate);
      if (form.notes) fd.append('notes', form.notes);
      if (file) fd.append('file', file);
      await api.deductions.create(employee.id, fd);
      setForm(emptyDeductionForm);
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (deduction) => {
    setError('');
    setBusyId(deduction.id);
    try {
      await api.deductions.setStatus(employee.id, deduction.id, !deduction.active);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (deduction) => {
    if (!window.confirm(t('personnel.detail.deductions.confirmDelete'))) return;
    setError('');
    setBusyId(deduction.id);
    try {
      await api.deductions.remove(employee.id, deduction.id);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card title={t('personnel.detail.deductions.title')} actions={
      <Can module="personal" action="edit">
        <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? t('common.cancel') : t('personnel.detail.deductions.newDeduction')}
        </Button>
      </Can>
    }>
      <p className="text-sm text-gray-500 mb-3">{t('personnel.detail.deductions.help')}</p>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 items-end">
          <Select label={t('personnel.detail.deductions.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, embargoKind: '' })} required>
            <option value="">{t('common.selectPlaceholder')}</option>
            {DEDUCTION_TYPES.map((dt) => <option key={dt} value={dt}>{t(`personnel.detail.deductions.types.${dt}`)}</option>)}
          </Select>
          <Input label={t('personnel.detail.deductions.concept')} value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required className="lg:col-span-2" />
          {form.type === 'embargo' && (
            <Select label={t('personnel.detail.deductions.embargoKind')} value={form.embargoKind} onChange={(e) => setForm({ ...form, embargoKind: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              <option value="ordinario">{t('personnel.detail.deductions.embargoKinds.ordinario')}</option>
              <option value="alimentos">{t('personnel.detail.deductions.embargoKinds.alimentos')}</option>
            </Select>
          )}
          <Input label={t('personnel.detail.deductions.totalAmount')} type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} />
          <Input label={t('personnel.detail.deductions.installmentAmount')} type="number" min="0" step="0.01" value={form.installmentAmount} onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })} required />
          <Input label={t('personnel.detail.deductions.startDate')} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Input
            label={REQUIRES_AUTHORIZATION_FILE(form.type) ? t('personnel.detail.deductions.authorizationRequired') : t('personnel.detail.deductions.authorizationOptional')}
            type="file" onChange={(e) => setFile(e.target.files[0])} required={REQUIRES_AUTHORIZATION_FILE(form.type)}
          />
          <Input label={t('personnel.detail.deductions.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="lg:col-span-2" />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      {!showForm && <ErrorText>{error}</ErrorText>}
      <Table columns={[t('personnel.detail.deductions.table.type'), t('personnel.detail.deductions.table.concept'), t('personnel.detail.deductions.table.installment'), t('personnel.detail.deductions.table.balance'), t('personnel.detail.deductions.table.status'), t('personnel.detail.deductions.table.support'), '']}>
        {deductions.map((d) => (
          <tr key={d.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{t(`personnel.detail.deductions.types.${d.type}`)}</td>
            <td className="py-1 pr-3">{d.concept}</td>
            <td className="py-1 pr-3">{money(d.installmentAmount)}</td>
            <td className="py-1 pr-3">{d.balance != null ? money(d.balance) : t('personnel.detail.deductions.indefinite')}</td>
            <td className="py-1 pr-3"><Badge color={d.active ? 'green' : 'gray'}>{t(d.active ? 'admin.leaveTypes.active' : 'admin.leaveTypes.inactive')}</Badge></td>
            <td className="py-1 pr-3">{d.authorizationFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(d.authorizationFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Can module="personal" action="edit">
                <button type="button" className="text-blue-600 hover:underline text-xs" disabled={busyId === d.id} onClick={() => toggleStatus(d)}>
                  {d.active ? t('admin.leaveTypes.deactivate') : t('admin.leaveTypes.activate')}
                </button>
              </Can>
              <Can module="personal" action="delete">
                <button type="button" className="text-red-600 hover:underline text-xs ml-2" disabled={busyId === d.id} onClick={() => remove(d)}>{t('common.delete')}</button>
              </Can>
            </td>
          </tr>
        ))}
        {deductions.length === 0 && <tr><td colSpan={7} className="py-2 text-center text-gray-400">{t('personnel.detail.deductions.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

// Las 7 horas extra/recargos de Ley (ver OVERTIME_TYPES en laborCalculations.js, backend) — mismo
// orden y mismas claves, para que overtimeHours viaje tal cual al payload de preview/confirm.
const OVERTIME_FIELDS = [
  'horaExtraDiurna', 'horaExtraNocturna', 'recargoNocturno', 'recargoDominical',
  'recargoNocturnoDominical', 'horaExtraDiurnaDominical', 'horaExtraNocturnaDominical',
];
const EMPTY_OVERTIME = Object.fromEntries(OVERTIME_FIELDS.map((f) => [f, '']));

// Personal ADMINISTRATIVO (employee.projectId null) exige caja de origen: confirmar su nómina
// genera automáticamente el Gasto administrativo correspondiente (ver payrollController.js#confirm)
// — personal de proyecto sigue funcionando exactamente igual que antes (sin caja, sin Gasto).
function PayrollCalculator({ api, employee, onChange }) {
  const { t } = useTranslation();
  const isAdministrative = !employee.projectId;
  const [form, setForm] = useState({ periodStart: '', periodEnd: '', paymentDate: '', cashBoxId: '', retefuente: '' });
  const [overtime, setOvertime] = useState(EMPTY_OVERTIME);
  const [showOvertime, setShowOvertime] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [cashBoxes, setCashBoxes] = useState([]);

  useEffect(() => { if (isAdministrative) cashBoxesApi.list().then(setCashBoxes); }, [isAdministrative]);
  const cashBoxOptions = cashBoxes.filter((cb) => cb.status === 'activa');

  const buildPayload = () => ({
    ...form,
    overtimeHours: Object.fromEntries(OVERTIME_FIELDS.map((f) => [f, Number(overtime[f]) || 0])),
  });

  const doPreview = async (e) => {
    e.preventDefault();
    setError('');
    setPreview(null);
    try {
      const result = await api.payroll.preview(employee.id, buildPayload());
      setPreview(result);
    } catch (err) {
      setError(extractError(err));
    }
  };

  const [confirm, confirming] = useSubmitGuard(async () => {
    if (isAdministrative && !form.cashBoxId) { setError(t('personnel.detail.payments.payroll.cashBoxRequired')); return; }
    setError('');
    setWarning('');
    try {
      const result = await api.payroll.confirm(employee.id, buildPayload());
      if (result.warning) setWarning(result.warning);
      setPreview(null);
      setForm({ periodStart: '', periodEnd: '', paymentDate: '', cashBoxId: '', retefuente: '' });
      setOvertime(EMPTY_OVERTIME);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <div className="mb-4 pb-4 border-b">
      <h4 className="font-medium text-sm text-gray-700 mb-2">{t('personnel.detail.payments.payroll.title')}</h4>
      <form onSubmit={doPreview} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 items-end">
        <Input label={t('personnel.detail.payments.payroll.periodStart')} type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required />
        <Input label={t('personnel.detail.payments.payroll.periodEnd')} type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required />
        <Input label={t('personnel.detail.payments.payroll.paymentDate')} type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} required />
        {isAdministrative && (
          <Select label={t('expenses.cashBox')} value={form.cashBoxId} onChange={(e) => setForm({ ...form, cashBoxId: e.target.value })} required>
            <option value="">{t('common.selectPlaceholder')}</option>
            {cashBoxOptions.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({money(cb.balance)})</option>)}
          </Select>
        )}
        <Input label={t('personnel.detail.payments.payroll.retefuente')} type="number" min="0" step="0.01" value={form.retefuente} onChange={(e) => setForm({ ...form, retefuente: e.target.value })} />
        <div className="col-span-full">
          <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setShowOvertime((s) => !s)}>
            {showOvertime ? t('personnel.detail.payments.payroll.hideOvertime') : t('personnel.detail.payments.payroll.showOvertime')}
          </button>
        </div>
        {showOvertime && (
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t pt-3">
            {OVERTIME_FIELDS.map((f) => (
              <Input
                key={f}
                label={t(`personnel.detail.payments.payroll.overtime.${f}`)}
                type="number" min="0" step="0.5"
                value={overtime[f]}
                onChange={(e) => setOvertime({ ...overtime, [f]: e.target.value })}
              />
            ))}
          </div>
        )}
        <Button type="submit">{t('personnel.detail.payments.payroll.calculate')}</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {warning && <p className="text-sm text-yellow-600 mb-2">⚠ {warning}</p>}
      {preview && (
        <div className="mt-2">
          <PayrollBreakdownTable breakdown={preview.breakdown} />
          <div className="flex items-center justify-end mt-2">
            <Button onClick={confirm} loading={confirming}>
              {confirming ? t('personnel.detail.payments.payroll.processing') : t('personnel.detail.payments.payroll.confirmButton')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsSection({ api, employee, onChange }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ date: '', periodLabel: '', amount: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError(t('personnel.detail.payments.missingFile')); return; }
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('file', file);
      await api.employees.addPayment(employee.id, fd);
      setForm({ date: '', periodLabel: '', amount: '' });
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('personnel.detail.payments.title')}>
      <Can module="personal" action="edit">
        <PayrollCalculator api={api} employee={employee} onChange={onChange} />
        <h4 className="font-medium text-sm text-gray-700 mb-2">{t('personnel.detail.payments.manualTitle')}</h4>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 items-end">
          <Input label={t('personnel.detail.payments.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label={t('personnel.detail.payments.period')} placeholder={t('personnel.detail.payments.periodPlaceholder')} value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} required />
          <Input label={t('personnel.detail.payments.amount')} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <Input label={t('personnel.detail.payments.receipt')} type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('personnel.detail.payments.attach')}</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Can>
      <Table columns={[t('personnel.detail.payments.table.date'), t('personnel.detail.payments.table.period'), t('personnel.detail.payments.table.amount'), t('personnel.detail.payments.table.file'), t('personnel.detail.payments.table.pdf')]}>
        {employee.paymentReceipts?.map((p) => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{formatDate(p.date)}</td>
            <td className="py-1 pr-3">{p.periodLabel}</td>
            <td className="py-1 pr-3">{money(p.amount)}</td>
            <td className="py-1 pr-3">{p.filePath ? <a className="text-blue-600 hover:underline" href={fileUrl(p.filePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
            <td className="py-1 pr-3">{p.pdfFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(p.pdfFilePath)} target="_blank" rel="noreferrer">PDF</a> : '-'}</td>
          </tr>
        ))}
        {(!employee.paymentReceipts || employee.paymentReceipts.length === 0) && (
          <tr><td colSpan={5} className="py-2 text-center text-gray-400">{t('personnel.detail.payments.empty')}</td></tr>
        )}
      </Table>
    </Card>
  );
}

function BreakdownTable({ breakdown }) {
  const { t } = useTranslation();
  return (
    <Table columns={[t('personnel.detail.breakdown.concept'), t('personnel.detail.breakdown.formula'), t('personnel.detail.breakdown.value')]}>
      {breakdown.conceptos.map((c, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className="py-1 pr-3 font-medium">{c.concepto}</td>
          <td className="py-1 pr-3 text-xs text-gray-500">{c.formula}</td>
          <td className="py-1 pr-3">{money(c.valor)}</td>
        </tr>
      ))}
    </Table>
  );
}

// Nómina (a partir de la Fase 2 de horas extra/recargos/deducciones) agrupa el desglose en
// Devengados / Deducciones / Neto a pagar — distinto de BreakdownTable (lista plana), que sigue
// usando Liquidación, sin deducciones de ley.
function PayrollBreakdownTable({ breakdown }) {
  const { t } = useTranslation();
  const rows = (items) => items.map((c, i) => (
    <tr key={i} className="border-b border-gray-100">
      <td className="py-1 pr-3 font-medium">{c.concepto}</td>
      <td className="py-1 pr-3 text-xs text-gray-500">{c.formula}</td>
      <td className="py-1 pr-3">{money(c.valor)}</td>
    </tr>
  ));
  return (
    <div>
      {breakdown.overtimeWarning && <p className="text-sm text-yellow-600 mb-2">⚠ {breakdown.overtimeWarning}</p>}
      <h5 className="text-xs font-semibold text-gray-600 mb-1">{t('personnel.detail.payments.payroll.earned')}</h5>
      <Table columns={[t('personnel.detail.breakdown.concept'), t('personnel.detail.breakdown.formula'), t('personnel.detail.breakdown.value')]}>
        {rows(breakdown.devengados)}
      </Table>
      <p className="text-right text-sm font-semibold mt-1">{t('personnel.detail.payments.payroll.totalEarned')}: {money(breakdown.totalDevengado)}</p>

      <h5 className="text-xs font-semibold text-gray-600 mb-1 mt-3">{t('personnel.detail.payments.payroll.deductions')}</h5>
      {breakdown.deducciones.length ? (
        <Table columns={[t('personnel.detail.breakdown.concept'), t('personnel.detail.breakdown.formula'), t('personnel.detail.breakdown.value')]}>
          {rows(breakdown.deducciones)}
        </Table>
      ) : (
        <p className="text-sm text-gray-400">{t('personnel.detail.payments.payroll.noDeductions')}</p>
      )}
      <p className="text-right text-sm font-semibold mt-1">{t('personnel.detail.payments.payroll.totalDeductions')}: {money(breakdown.totalDeducciones)}</p>

      <p className="text-right font-bold text-lg mt-2 border-t pt-2">{t('personnel.detail.payments.payroll.netPay')}: {money(breakdown.total)}</p>
    </div>
  );
}

function SeveranceSection({ api, employee, onChange }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ exitDate: '', cause: 'renuncia', cashBoxId: '' });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [cashBoxes, setCashBoxes] = useState([]);

  useEffect(() => { cashBoxesApi.list().then(setCashBoxes); }, []);
  const cashBoxOptions = cashBoxes.filter((cb) => cb.status === 'activa');

  const doPreview = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await api.employees.severancePreview(employee.id, form);
      setPreview(result);
    } catch (err) {
      setError(extractError(err));
    }
  };

  const [confirm, confirming] = useSubmitGuard(async () => {
    if (!form.cashBoxId) { setError(t('personnel.detail.severance.cashBoxRequired')); return; }
    if (!window.confirm(t('personnel.detail.severance.confirmDialog'))) return;
    setError('');
    setWarning('');
    try {
      const result = await api.employees.severanceConfirm(employee.id, form);
      if (result.warning) setWarning(result.warning);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('personnel.detail.severance.title')}>
      <Can module="personal" action="edit">
        <form onSubmit={doPreview} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3 items-end">
          <Input label={t('personnel.detail.severance.exitDate')} type="date" value={form.exitDate} onChange={(e) => setForm({ ...form, exitDate: e.target.value })} required />
          <Select label={t('personnel.detail.severance.cause')} value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })}>
            <option value="renuncia">{t('personnel.detail.severance.causes.renuncia')}</option>
            <option value="justa_causa">{t('personnel.detail.severance.causes.justa_causa')}</option>
            <option value="sin_justa_causa">{t('personnel.detail.severance.causes.sin_justa_causa')}</option>
            <option value="terminacion_termino">{t('personnel.detail.severance.causes.terminacion_termino')}</option>
          </Select>
          <Select label={t('expenses.cashBox')} value={form.cashBoxId} onChange={(e) => setForm({ ...form, cashBoxId: e.target.value })}>
            <option value="">{t('common.selectPlaceholder')}</option>
            {cashBoxOptions.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({money(cb.balance)})</option>)}
          </Select>
          <Button type="submit">{t('personnel.detail.severance.calculate')}</Button>
        </form>
        <ErrorText>{error}</ErrorText>
        {warning && <p className="text-sm text-yellow-600 mt-1">⚠ {warning}</p>}
      </Can>

      {preview && (
        <div className="mt-3 border-t pt-3">
          <BreakdownTable breakdown={preview.breakdown} />
          <p className="text-right font-bold text-lg mt-2">{t('common.total')}: {money(preview.total)}</p>
          <Can module="personal" action="edit">
            <div className="text-right mt-2">
              <Button variant="danger" onClick={confirm} loading={confirming}>
                {confirming ? t('personnel.detail.severance.processing') : t('personnel.detail.severance.confirmButton')}
              </Button>
            </div>
          </Can>
        </div>
      )}
    </Card>
  );
}

function SeveranceSummary({ api, employee, onChange }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const severance = employee.severance;
  if (!severance) return null;

  const upload = async () => {
    if (!file) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.employees.uploadPazYSalvo(employee.id, fd);
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('personnel.detail.severance.summaryTitle')}>
      <BreakdownTable breakdown={severance.breakdown} />
      <p className="text-right font-bold text-lg mt-2">{t('common.total')}: {money(severance.total)}</p>
      {severance.pdfFilePath && (
        <p className="mt-2">
          <a className="text-blue-600 hover:underline text-sm" href={fileUrl(severance.pdfFilePath)} target="_blank" rel="noreferrer">{t('personnel.detail.severance.viewPdf')}</a>
        </p>
      )}
      <div className="mt-3 border-t pt-3 flex items-center gap-3">
        {severance.pazYSalvoFilePath ? (
          <a className="text-blue-600 hover:underline text-sm" href={fileUrl(severance.pazYSalvoFilePath)} target="_blank" rel="noreferrer">{t('personnel.detail.severance.viewSigned')}</a>
        ) : (
          <Can module="personal" action="edit">
            <Input type="file" onChange={(e) => setFile(e.target.files[0])} />
            <Button onClick={upload}>{t('personnel.detail.severance.uploadSigned')}</Button>
          </Can>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
