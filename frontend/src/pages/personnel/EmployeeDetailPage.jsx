import { useEffect, useState } from 'react';
import { useOutletContext, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { employeesApi, employeeContractsApi, cashBoxesApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

export default function EmployeeDetailPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const { employeeId } = useParams();
  const [employee, setEmployee] = useState(null);

  const load = () => employeesApi.get(projectId, employeeId).then(setEmployee);
  useEffect(() => { load(); }, [projectId, employeeId]);

  if (!employee) return <div className="text-gray-500">{t('common.loading')}</div>;

  return (
    <div>
      <Link to="../personnel" className="text-sm text-blue-600 hover:underline">{t('personnel.detail.back')}</Link>
      <div className="flex items-center gap-3 mt-2 mb-4">
        <h2 className="text-lg font-bold">{employee.name}</h2>
        <Badge color={employee.status === 'activo' ? 'green' : 'gray'}>{t(`personnel.list.status.${employee.status}`, employee.status)}</Badge>
      </div>

      <BasicDataSection projectId={projectId} employee={employee} onChange={load} />
      <ContractsSection projectId={projectId} employee={employee} onChange={load} />
      <SocialSecuritySection projectId={projectId} employee={employee} onChange={load} />
      <PaymentsSection projectId={projectId} employee={employee} onChange={load} />
      {employee.status === 'activo' ? (
        <SeveranceSection projectId={projectId} employee={employee} onChange={load} />
      ) : (
        <SeveranceSummary employee={employee} projectId={projectId} onChange={load} />
      )}
    </div>
  );
}

const NEEDS_END_DATE = new Set(['termino_fijo', 'aprendizaje', 'prestacion_servicios', 'subcontratista_natural', 'subcontratista_juridica']);
const IS_SUBCONTRATISTA_JURIDICA = (t) => t === 'subcontratista_juridica';
const IS_LABORAL = (t) => ['obra_labor', 'termino_fijo', 'termino_indefinido'].includes(t);

function BasicDataSection({ projectId, employee, onChange }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [cedulaFile, setCedulaFile] = useState(null);
  const [contractTypes, setContractTypes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { employeeContractsApi.contractTypes().then(setContractTypes); }, []);

  const startEdit = () => {
    setForm({
      position: employee.position || '', salaryValue: employee.salaryValue || '', dedicationHours: employee.dedicationHours || '',
      documentType: employee.documentType || '', documentNumber: employee.documentNumber || '',
      address: employee.address || '', city: employee.city || '', phone: employee.phone || '',
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
      await employeesApi.update(projectId, employee.id, form);
      if (cedulaFile) {
        const fd = new FormData();
        fd.append('file', cedulaFile);
        await employeesApi.uploadCedula(projectId, employee.id, fd);
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
          <Input label={t('personnel.detail.position')} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <Input label={t('personnel.detail.salary')} type="number" min="0" step="0.01" value={form.salaryValue} onChange={(e) => setForm({ ...form, salaryValue: e.target.value })} />
          <Input label={t('personnel.detail.dedication')} type="number" min="0" step="0.01" value={form.dedicationHours} onChange={(e) => setForm({ ...form, dedicationHours: e.target.value })} />

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

          <Input label={t('personnel.contract.object')} value={form.contractObject} onChange={(e) => setForm({ ...form, contractObject: e.target.value })} className="lg:col-span-2" />
          {NEEDS_END_DATE.has(form.contractType) && (
            <Input label={t('personnel.contract.endDate')} type="date" value={form.contractEndDate} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} />
          )}

          {(IS_LABORAL(form.contractType) || form.contractType === 'aprendizaje') && (
            <>
              <Input label={t('personnel.detail.eps')} value={form.epsName} onChange={(e) => setForm({ ...form, epsName: e.target.value })} />
              {form.contractType !== 'aprendizaje' && (
                <Input label={t('personnel.detail.pensionFund')} value={form.pensionFundName} onChange={(e) => setForm({ ...form, pensionFundName: e.target.value })} />
              )}
              <Input label={t('personnel.detail.arl')} value={form.arlName} onChange={(e) => setForm({ ...form, arlName: e.target.value })} />
            </>
          )}
          {form.contractType === 'subcontratista_natural' && (
            <Input label={t('personnel.detail.arl')} value={form.arlName} onChange={(e) => setForm({ ...form, arlName: e.target.value })} />
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

function ContractsSection({ projectId, employee, onChange }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState([]);
  const [contractTypes, setContractTypes] = useState([]);
  const [error, setError] = useState('');
  const [missingFields, setMissingFields] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [otrosiForm, setOtrosiForm] = useState({ newContractObject: '', newEndDate: '', newSalaryValue: '' });
  const [showOtrosi, setShowOtrosi] = useState(false);

  const load = () => employeeContractsApi.list(projectId, employee.id).then(setDocs);
  useEffect(() => { load(); }, [projectId, employee.id]);
  useEffect(() => { employeeContractsApi.contractTypes().then(setContractTypes); }, []);

  const typeLabel = (value) => contractTypes.find((ct) => ct.value === value)?.label || value;

  const generate = async () => {
    setError(''); setMissingFields([]); setGenerating(true);
    try {
      await employeeContractsApi.generate(projectId, employee.id);
      load();
    } catch (err) {
      setError(extractError(err));
      setMissingFields(err?.response?.data?.details?.missingFields || []);
    } finally {
      setGenerating(false);
    }
  };

  const submitOtrosi = async (e) => {
    e.preventDefault();
    setError('');
    const last = docs[docs.length - 1];
    if (!last) return;
    try {
      const payload = {};
      if (otrosiForm.newContractObject) payload.newContractObject = otrosiForm.newContractObject;
      if (otrosiForm.newEndDate) payload.newEndDate = otrosiForm.newEndDate;
      if (otrosiForm.newSalaryValue) payload.newSalaryValue = otrosiForm.newSalaryValue;
      await employeeContractsApi.generateOtrosi(projectId, employee.id, last.id, payload);
      setOtrosiForm({ newContractObject: '', newEndDate: '', newSalaryValue: '' });
      setShowOtrosi(false);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('personnel.contract.title')} actions={
      <Can module="personal" action="edit">
        <div className="flex gap-2">
          {employee.contractType === 'obra_labor' && docs.length > 0 && (
            <Button variant="secondary" onClick={() => setShowOtrosi((s) => !s)}>{showOtrosi ? t('common.cancel') : t('personnel.contract.newOtrosi')}</Button>
          )}
          <Button onClick={generate} disabled={generating}>{generating ? t('personnel.contract.generating') : t('personnel.contract.generate')}</Button>
        </div>
      </Can>
    }>
      <ErrorText>{error}</ErrorText>
      {missingFields.length > 0 && (
        <p className="text-sm text-yellow-700 mb-2">{t('personnel.contract.missingFields')}: {missingFields.join(', ')}</p>
      )}
      {showOtrosi && (
        <form onSubmit={submitOtrosi} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 items-end border-b pb-3">
          <Input label={t('personnel.contract.newObject')} value={otrosiForm.newContractObject} onChange={(e) => setOtrosiForm({ ...otrosiForm, newContractObject: e.target.value })} />
          <Input label={t('personnel.contract.newEndDate')} type="date" value={otrosiForm.newEndDate} onChange={(e) => setOtrosiForm({ ...otrosiForm, newEndDate: e.target.value })} />
          <Input label={t('personnel.contract.newValue')} type="number" min="0" step="0.01" value={otrosiForm.newSalaryValue} onChange={(e) => setOtrosiForm({ ...otrosiForm, newSalaryValue: e.target.value })} />
          <Button type="submit">{t('personnel.contract.generateOtrosi')}</Button>
        </form>
      )}
      <Table columns={[t('personnel.contract.table.type'), t('personnel.contract.table.number'), t('personnel.contract.table.from'), t('personnel.contract.table.to'), t('personnel.contract.table.value'), t('personnel.contract.table.pdf'), t('personnel.contract.table.docx')]}>
        {docs.map((d) => (
          <tr key={d.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{d.kind === 'otrosi' ? `${t('personnel.contract.otrosiLabel')} ${d.sequenceNumber}` : typeLabel(d.contractType)}</td>
            <td className="py-1 pr-3">{d.sequenceNumber}</td>
            <td className="py-1 pr-3">{formatDate(d.effectiveFrom) || '-'}</td>
            <td className="py-1 pr-3">{formatDate(d.effectiveTo) || '-'}</td>
            <td className="py-1 pr-3">{money(d.valueAtIssue)}</td>
            <td className="py-1 pr-3">{d.pdfFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(d.pdfFilePath)} target="_blank" rel="noreferrer">PDF</a> : '-'}</td>
            <td className="py-1 pr-3">{d.docxFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(d.docxFilePath)} target="_blank" rel="noreferrer">Word</a> : '-'}</td>
          </tr>
        ))}
        {docs.length === 0 && <tr><td colSpan={7} className="py-2 text-center text-gray-400">{t('personnel.contract.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

function SocialSecuritySection({ projectId, employee, onChange }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ type: 'salud', uploadDate: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError(t('personnel.detail.socialSecurity.missingFile')); return; }
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('uploadDate', form.uploadDate || new Date().toISOString().slice(0, 10));
      fd.append('file', file);
      await employeesApi.addSocialSecurity(projectId, employee.id, fd);
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

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
          <Button type="submit">{t('personnel.detail.socialSecurity.attach')}</Button>
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

function PaymentsSection({ projectId, employee, onChange }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ date: '', periodLabel: '', amount: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError(t('personnel.detail.payments.missingFile')); return; }
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('file', file);
      await employeesApi.addPayment(projectId, employee.id, fd);
      setForm({ date: '', periodLabel: '', amount: '' });
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('personnel.detail.payments.title')}>
      <Can module="personal" action="edit">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 items-end">
          <Input label={t('personnel.detail.payments.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label={t('personnel.detail.payments.period')} placeholder={t('personnel.detail.payments.periodPlaceholder')} value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} required />
          <Input label={t('personnel.detail.payments.amount')} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <Input label={t('personnel.detail.payments.receipt')} type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <Button type="submit" className="col-span-full">{t('personnel.detail.payments.attach')}</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Can>
      <Table columns={[t('personnel.detail.payments.table.date'), t('personnel.detail.payments.table.period'), t('personnel.detail.payments.table.amount'), t('personnel.detail.payments.table.file')]}>
        {employee.paymentReceipts?.map((p) => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{formatDate(p.date)}</td>
            <td className="py-1 pr-3">{p.periodLabel}</td>
            <td className="py-1 pr-3">{money(p.amount)}</td>
            <td className="py-1 pr-3"><a className="text-blue-600 hover:underline" href={fileUrl(p.filePath)} target="_blank" rel="noreferrer">{t('common.view')}</a></td>
          </tr>
        ))}
        {(!employee.paymentReceipts || employee.paymentReceipts.length === 0) && (
          <tr><td colSpan={4} className="py-2 text-center text-gray-400">{t('personnel.detail.payments.empty')}</td></tr>
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

function SeveranceSection({ projectId, employee, onChange }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ exitDate: '', cause: 'renuncia', cashBoxId: '' });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [warning, setWarning] = useState('');
  const [cashBoxes, setCashBoxes] = useState([]);

  useEffect(() => { cashBoxesApi.list().then(setCashBoxes); }, []);
  const cashBoxOptions = cashBoxes.filter((cb) => cb.status === 'activa');

  const doPreview = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await employeesApi.severancePreview(projectId, employee.id, form);
      setPreview(result);
    } catch (err) {
      setError(extractError(err));
    }
  };

  const confirm = async () => {
    if (!form.cashBoxId) { setError(t('personnel.detail.severance.cashBoxRequired')); return; }
    if (!window.confirm(t('personnel.detail.severance.confirmDialog'))) return;
    setConfirming(true);
    setError('');
    setWarning('');
    try {
      const result = await employeesApi.severanceConfirm(projectId, employee.id, form);
      if (result.warning) setWarning(result.warning);
      onChange();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setConfirming(false);
    }
  };

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
              <Button variant="danger" onClick={confirm} disabled={confirming}>
                {confirming ? t('personnel.detail.severance.processing') : t('personnel.detail.severance.confirmButton')}
              </Button>
            </div>
          </Can>
        </div>
      )}
    </Card>
  );
}

function SeveranceSummary({ employee, projectId, onChange }) {
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
      await employeesApi.uploadPazYSalvo(projectId, employee.id, fd);
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
