import { useEffect, useState } from 'react';
import { useOutletContext, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { employeesApi } from '../../api';
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

      <Card title={t('personnel.detail.basicData')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div><span className="text-gray-500">{t('personnel.detail.position')}:</span> {employee.position}</div>
          <div><span className="text-gray-500">{t('personnel.detail.entry')}:</span> {formatDate(employee.entryDate)}</div>
          <div><span className="text-gray-500">{t('personnel.detail.exit')}:</span> {formatDate(employee.exitDate) || '-'}</div>
          <div><span className="text-gray-500">{t('personnel.detail.salary')}:</span> {money(employee.salaryValue)}</div>
          <div><span className="text-gray-500">{t('personnel.detail.dedication')}:</span> {employee.dedicationHours || '-'} h</div>
          <div><span className="text-gray-500">{t('personnel.detail.contract')}:</span> {employee.contractFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(employee.contractFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</div>
        </div>
      </Card>

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
  const [form, setForm] = useState({ exitDate: '', cause: 'renuncia' });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

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
    if (!window.confirm(t('personnel.detail.severance.confirmDialog'))) return;
    setConfirming(true);
    setError('');
    try {
      await employeesApi.severanceConfirm(projectId, employee.id, form);
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
          <Button type="submit">{t('personnel.detail.severance.calculate')}</Button>
        </form>
        <ErrorText>{error}</ErrorText>
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
