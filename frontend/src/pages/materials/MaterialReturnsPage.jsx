import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialReturnsApi, materialIssuesApi, warehousesApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, formatDate, money } from '../../components/ui';
import Can from '../../components/Can';
import SignaturePad from '../../components/SignaturePad';
import useSubmitGuard from '../../hooks/useSubmitGuard';
import { useAuth } from '../../context/AuthContext';

const emptyForm = () => ({ originIssueId: '', toWarehouseId: '', date: '', materialId: '', quantity: '' });

const STATUS_COLORS = { pendiente_firma: 'yellow', firmado: 'green', rechazado: 'red' };

export default function MaterialReturnsPage() {
  const { t } = useTranslation();
  const [returns, setReturns] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [signedIssues, setSignedIssues] = useState([]);
  const [returnable, setReturnable] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => materialReturnsApi.list().then(setReturns);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    warehousesApi.list().then(setWarehouses);
    materialIssuesApi.list().then((list) => setSignedIssues(list.filter((is) => is.status === 'firmado')));
  }, []);

  useEffect(() => {
    if (!form.originIssueId) { setReturnable([]); return; }
    materialReturnsApi.returnable(form.originIssueId).then(setReturnable);
  }, [form.originIssueId]);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await materialReturnsApi.create(form);
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('materialsInventory.returns.title')} actions={
      <Can module="devoluciones_material" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? t('common.cancel') : t('materialsInventory.returns.newReturn')}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label={t('materialsInventory.returns.originIssue')} value={form.originIssueId} onChange={(e) => setForm({ ...form, originIssueId: e.target.value, materialId: '' })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {signedIssues.map((is) => (
                <option key={is.id} value={is.id}>
                  {is.contractPrefix ? `${is.contractPrefix}-${is.issueNumber}` : is.id.slice(0, 8)} — {is.Project?.name || is.freeTextDestination} — {formatDate(is.date)}
                </option>
              ))}
            </Select>
            <Select label={t('materialsInventory.transfers.to')} value={form.toWarehouseId} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <Select label={t('materialsInventory.catalog.name')} value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {returnable.map((r) => <option key={r.materialId} value={r.materialId}>{r.materialName} ({t('materialsInventory.returns.returnable')}: {r.returnable})</option>)}
            </Select>
            <Input label={t('materialsInventory.transfers.quantity')} type="number" min="0.0001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            <Input label={t('materialsInventory.transfers.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={submitting}>{t('common.save')}</Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      )}

      <Table columns={[t('materialsInventory.transfers.date'), t('expenses.list.number'), t('materialsInventory.transfers.to'), t('materialsInventory.catalog.status'), '']}>
        {returns.map((ret) => (
          <Fragment key={ret.id}>
            <tr className="border-b border-gray-100">
              <td className="py-1 pr-3">{formatDate(ret.date)}</td>
              <td className="py-1 pr-3">{ret.contractPrefix ? `${ret.contractPrefix}-${ret.returnNumber}` : ret.id.slice(0, 8)}{ret.Project?.name ? ` — ${ret.Project.name}` : ''}</td>
              <td className="py-1 pr-3">{ret.toWarehouse?.name}</td>
              <td className="py-1 pr-3"><Badge color={STATUS_COLORS[ret.status]}>{t(`materialsInventory.issues.status.${ret.status}`)}</Badge></td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <a className="text-blue-600 hover:underline text-xs mr-2" href={materialReturnsApi.pdfUrl(ret.id)} target="_blank" rel="noreferrer">{t('common.view')}</a>
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedId(expandedId === ret.id ? null : ret.id)}>
                  {expandedId === ret.id ? t('materialsInventory.stock.hideLots') : t('materialsInventory.transfers.detail')}
                </button>
              </td>
            </tr>
            {expandedId === ret.id && <ReturnDetail materialReturn={ret} onChange={load} />}
          </Fragment>
        ))}
        {returns.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('materialsInventory.returns.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

function ReturnDetail({ materialReturn, onChange }) {
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
    await materialReturnsApi.sign(materialReturn.id, { signatureDataUrl, signerName });
    setMode(null);
    onChange();
  });

  const [doReject, rejecting] = useSubmitGuard(async () => {
    setError('');
    if (!rejectionReason.trim()) { setError(t('materialsInventory.transfers.rejectReasonRequired')); return; }
    await materialReturnsApi.reject(materialReturn.id, rejectionReason);
    setMode(null);
    onChange();
  });

  const [doVoid, voiding] = useSubmitGuard(async () => {
    setError('');
    if (!voidObservation.trim()) { setError(t('materialsInventory.audit.observationRequired')); return; }
    try {
      await materialReturnsApi.voidSigned(materialReturn.id, voidObservation);
      setMode(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const [doRequestLink, requestingLink] = useSubmitGuard(async () => {
    setError('');
    try {
      const res = await materialReturnsApi.requestSignature(materialReturn.id, { email: email || null, phone: phone || null });
      setLinkResult(res);
    } catch (err) {
      setError(extractError(err));
    }
  });

  const isPending = materialReturn.status === 'pendiente_firma';

  return (
    <tr className="border-b border-gray-100 bg-gray-50">
      <td colSpan={5} className="py-3 px-3">
        <Table columns={[t('materialsInventory.catalog.name'), t('materialsInventory.transfers.quantity'), t('materialsInventory.stock.unitCost')]}>
          {materialReturn.lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{l.Material?.name}</td>
              <td className="py-1 pr-3">{Number(l.quantity)}</td>
              <td className="py-1 pr-3">{money(l.unitCost)}</td>
            </tr>
          ))}
        </Table>
        {materialReturn.rejectionReason && <p className="text-xs text-red-700 mt-1">{t('materialsInventory.transfers.rejectReason')}: {materialReturn.rejectionReason}</p>}

        {isPending && (
          <Can module="devoluciones_material" action="edit">
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

        {materialReturn.status === 'firmado' && isAdmin && (
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
