import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialIssuesApi, warehousesApi, materialsApi, projectsApi, generalEmployeesApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, formatDate, money } from '../../components/ui';
import Can from '../../components/Can';
import SignaturePad from '../../components/SignaturePad';
import useSubmitGuard from '../../hooks/useSubmitGuard';
import { useAuth } from '../../context/AuthContext';

const emptyLine = () => ({ materialId: '', quantity: '', salePriceUnit: '' });
const emptyForm = () => ({
  fromWarehouseId: '', date: '', destinationMode: 'project', projectId: '', freeTextDestination: '',
  receiverType: 'empleado', receiverEmployeeId: '',
  receiverExternalName: '', receiverExternalCedula: '', receiverExternalPhone: '', receiverExternalEmail: '',
  lines: [emptyLine()],
});

const STATUS_COLORS = { pendiente_firma: 'yellow', firmado: 'green', rechazado: 'red' };

export default function MaterialIssuesPage() {
  const { t } = useTranslation();
  const [issues, setIssues] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => materialIssuesApi.list().then(setIssues);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    warehousesApi.list().then(setWarehouses);
    materialsApi.list().then((list) => setMaterials(list.filter((m) => m.active)));
    projectsApi.list().then((list) => setProjects(list.filter((p) => p.status !== 'terminado')));
    generalEmployeesApi.list({ status: 'activo' }).then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const updateLine = (idx, field, value) => setForm((f) => {
    const lines = [...f.lines];
    lines[idx] = { ...lines[idx], [field]: value };
    return { ...f, lines };
  });
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (idx) => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        fromWarehouseId: form.fromWarehouseId,
        date: form.date,
        projectId: form.destinationMode === 'project' ? form.projectId : undefined,
        freeTextDestination: form.destinationMode === 'other' ? form.freeTextDestination : undefined,
        receiverType: form.receiverType,
        receiverEmployeeId: form.receiverType === 'empleado' ? form.receiverEmployeeId : undefined,
        receiverExternalName: form.receiverType === 'externo' ? form.receiverExternalName : undefined,
        receiverExternalCedula: form.receiverType === 'externo' ? form.receiverExternalCedula : undefined,
        receiverExternalPhone: form.receiverType === 'externo' ? form.receiverExternalPhone : undefined,
        receiverExternalEmail: form.receiverType === 'externo' ? form.receiverExternalEmail : undefined,
        lines: form.lines.filter((l) => l.materialId && l.quantity).map((l) => ({
          materialId: l.materialId, quantity: l.quantity, salePriceUnit: l.salePriceUnit || undefined,
        })),
      };
      await materialIssuesApi.create(payload);
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('materialsInventory.issues.title')} actions={
      <Can module="salidas_material" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? t('common.cancel') : t('materialsInventory.issues.newIssue')}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label={t('materialsInventory.transfers.from')} value={form.fromWarehouseId} onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Input label={t('materialsInventory.transfers.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">{t('materialsInventory.issues.destination')}</p>
            <div className="flex gap-4 mb-2 text-sm">
              <label className="flex items-center gap-1"><input type="radio" checked={form.destinationMode === 'project'} onChange={() => setForm({ ...form, destinationMode: 'project' })} /> {t('materialsInventory.issues.destinationProject')}</label>
              <label className="flex items-center gap-1"><input type="radio" checked={form.destinationMode === 'other'} onChange={() => setForm({ ...form, destinationMode: 'other' })} /> {t('materialsInventory.issues.destinationOther')}</label>
            </div>
            {form.destinationMode === 'project' ? (
              <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required>
                <option value="">{t('common.selectPlaceholder')}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.contractNumber ? `${p.contractNumber} – ` : ''}{p.name}</option>)}
              </Select>
            ) : (
              <Input value={form.freeTextDestination} onChange={(e) => setForm({ ...form, freeTextDestination: e.target.value })} placeholder={t('materialsInventory.issues.destinationOther')} required />
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">{t('materialsInventory.issues.receiver')}</p>
            <div className="flex gap-4 mb-2 text-sm">
              <label className="flex items-center gap-1"><input type="radio" checked={form.receiverType === 'empleado'} onChange={() => setForm({ ...form, receiverType: 'empleado' })} /> {t('materialsInventory.issues.receiverEmployee')}</label>
              <label className="flex items-center gap-1"><input type="radio" checked={form.receiverType === 'externo'} onChange={() => setForm({ ...form, receiverType: 'externo' })} /> {t('materialsInventory.issues.receiverExternal')}</label>
            </div>
            {form.receiverType === 'empleado' ? (
              <Select value={form.receiverEmployeeId} onChange={(e) => setForm({ ...form, receiverEmployeeId: e.target.value })} required>
                <option value="">{t('common.selectPlaceholder')}</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </Select>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Input label={t('materialsInventory.issues.receiverName')} value={form.receiverExternalName} onChange={(e) => setForm({ ...form, receiverExternalName: e.target.value })} required />
                <Input label={t('materialsInventory.issues.receiverCedula')} value={form.receiverExternalCedula} onChange={(e) => setForm({ ...form, receiverExternalCedula: e.target.value })} />
                <Input label={t('materialsInventory.issues.receiverPhone')} value={form.receiverExternalPhone} onChange={(e) => setForm({ ...form, receiverExternalPhone: e.target.value })} />
                <Input label={t('materialsInventory.issues.receiverEmail')} type="email" value={form.receiverExternalEmail} onChange={(e) => setForm({ ...form, receiverExternalEmail: e.target.value })} />
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">{t('materialsInventory.transfers.items')}</p>
            {form.lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 items-end">
                <Select label={t('materialsInventory.catalog.name')} value={l.materialId} onChange={(e) => updateLine(idx, 'materialId', e.target.value)} required>
                  <option value="">{t('common.selectPlaceholder')}</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                <Input label={t('materialsInventory.transfers.quantity')} type="number" min="0.0001" step="any" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} required />
                <Input label={t('materialsInventory.issues.salePrice')} type="number" min="0" step="0.01" value={l.salePriceUnit} onChange={(e) => updateLine(idx, 'salePriceUnit', e.target.value)} />
                <Button type="button" variant="danger" onClick={() => removeLine(idx)}>{t('common.remove')}</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addLine}>{t('materialsInventory.transfers.addItem')}</Button>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={submitting}>{t('common.save')}</Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      )}

      <Table columns={[t('materialsInventory.transfers.date'), t('materialsInventory.issues.destination'), t('materialsInventory.issues.receiver'), t('materialsInventory.catalog.status'), '']}>
        {issues.map((is) => (
          <Fragment key={is.id}>
            <tr className="border-b border-gray-100">
              <td className="py-1 pr-3">{formatDate(is.date)}</td>
              <td className="py-1 pr-3">{is.Project?.name || is.freeTextDestination}</td>
              <td className="py-1 pr-3">{is.receiverType === 'empleado' ? is.receiverEmployee?.name : is.receiverExternalName}</td>
              <td className="py-1 pr-3"><Badge color={STATUS_COLORS[is.status]}>{t(`materialsInventory.issues.status.${is.status}`)}</Badge></td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <a className="text-blue-600 hover:underline text-xs mr-2" href={materialIssuesApi.pdfUrl(is.id)} target="_blank" rel="noreferrer">{t('common.view')}</a>
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedId(expandedId === is.id ? null : is.id)}>
                  {expandedId === is.id ? t('materialsInventory.stock.hideLots') : t('materialsInventory.transfers.detail')}
                </button>
              </td>
            </tr>
            {expandedId === is.id && <IssueDetail issue={is} onChange={load} />}
          </Fragment>
        ))}
        {issues.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('materialsInventory.issues.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

function IssueDetail({ issue, onChange }) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [voidObservation, setVoidObservation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkResult, setLinkResult] = useState(null);

  const [doSign, signing] = useSubmitGuard(async ({ signatureDataUrl, signerName }) => {
    setError('');
    await materialIssuesApi.sign(issue.id, { signatureDataUrl, signerName });
    setMode(null);
    onChange();
  });

  const [doReject, rejecting] = useSubmitGuard(async () => {
    setError('');
    if (!rejectionReason.trim()) { setError(t('materialsInventory.transfers.rejectReasonRequired')); return; }
    await materialIssuesApi.reject(issue.id, rejectionReason);
    setMode(null);
    onChange();
  });

  const [doVoid, voiding] = useSubmitGuard(async () => {
    setError('');
    if (!voidObservation.trim()) { setError(t('materialsInventory.audit.observationRequired')); return; }
    try {
      await materialIssuesApi.voidSigned(issue.id, voidObservation);
      setMode(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const [doRequestLink, requestingLink] = useSubmitGuard(async () => {
    setError('');
    try {
      const res = await materialIssuesApi.requestSignature(issue.id, { email: email || null, phone: phone || null });
      setLinkResult(res);
    } catch (err) {
      setError(extractError(err));
    }
  });

  const isPending = issue.status === 'pendiente_firma';

  return (
    <tr className="border-b border-gray-100 bg-gray-50">
      <td colSpan={5} className="py-3 px-3">
        <Table columns={[t('materialsInventory.catalog.name'), t('materialsInventory.transfers.quantity'), t('materialsInventory.stock.unitCost'), t('materialsInventory.issues.salePrice')]}>
          {issue.lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{l.Material?.name}</td>
              <td className="py-1 pr-3">{Number(l.quantity)}</td>
              <td className="py-1 pr-3">{money(l.unitCost)}</td>
              <td className="py-1 pr-3">{l.salePriceUnit != null ? money(l.salePriceUnit) : '-'}</td>
            </tr>
          ))}
        </Table>
        {issue.rejectionReason && <p className="text-xs text-red-700 mt-1">{t('materialsInventory.transfers.rejectReason')}: {issue.rejectionReason}</p>}

        {isPending && (
          <Can module="salidas_material" action="edit">
            <div className="mt-3 flex gap-2">
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setMode(mode === 'sign' ? null : 'sign')}>{t('materialsInventory.issues.signNow')}</button>
              <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setMode(mode === 'reject' ? null : 'reject')}>{t('materialsInventory.transfers.rejectAction')}</button>
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setMode(mode === 'link' ? null : 'link')}>{t('voucherSignature.sendToSign')}</button>
            </div>
            <ErrorText>{error}</ErrorText>

            {mode === 'sign' && (
              <div className="mt-2 max-w-xs border border-blue-200 bg-blue-50/50 rounded p-3">
                <SignaturePad onSubmit={doSign} submitting={signing} submitLabel={t('materialsInventory.issues.signNow')} />
              </div>
            )}
            {mode === 'reject' && (
              <div className="mt-2 max-w-xs border border-red-200 bg-red-50/50 rounded p-3">
                <Input label={t('materialsInventory.transfers.rejectReason')} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="mb-2" required />
                <Button type="button" variant="danger" onClick={doReject} loading={rejecting}>{t('materialsInventory.transfers.rejectAction')}</Button>
              </div>
            )}
            {mode === 'link' && (
              <div className="mt-2 max-w-xs border border-blue-200 bg-blue-50/50 rounded p-3">
                <Input label={t('voucherSignature.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-2" />
                <Input label="WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} className="mb-2" />
                <Button type="button" onClick={doRequestLink} loading={requestingLink}>{t('voucherSignature.generateLink')}</Button>
                {linkResult && (
                  <p className="text-xs text-gray-600 break-all mt-2">{t('voucherSignature.copyLink')}: <a className="text-blue-600 hover:underline" href={linkResult.signUrl} target="_blank" rel="noreferrer">{linkResult.signUrl}</a></p>
                )}
              </div>
            )}
          </Can>
        )}

        {issue.status === 'firmado' && isAdmin && (
          <div className="mt-3">
            <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setMode(mode === 'void' ? null : 'void')}>{t('materialsInventory.audit.voidAction')}</button>
            <ErrorText>{error}</ErrorText>
            {mode === 'void' && (
              <div className="mt-2 max-w-xs border border-red-200 bg-red-50/50 rounded p-3">
                <Input label={t('materialsInventory.audit.observation')} value={voidObservation} onChange={(e) => setVoidObservation(e.target.value)} className="mb-2" required />
                <Button type="button" variant="danger" onClick={doVoid} loading={voiding}>{t('materialsInventory.audit.voidAction')}</Button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
