import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialTransfersApi, warehousesApi, materialsApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, formatDate, money } from '../../components/ui';
import Can from '../../components/Can';
import SignaturePad from '../../components/SignaturePad';
import useSubmitGuard from '../../hooks/useSubmitGuard';
import { useAuth } from '../../context/AuthContext';

const emptyLine = () => ({ materialId: '', quantity: '' });
const emptyForm = () => ({ fromWarehouseId: '', toWarehouseId: '', date: '', observations: '', lines: [emptyLine()] });

const STATUS_COLORS = { en_transito: 'yellow', confirmado: 'green', rechazado: 'red' };

export default function MaterialTransfersPage() {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => materialTransfersApi.list().then(setTransfers);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    warehousesApi.list().then(setWarehouses);
    materialsApi.list().then((list) => setMaterials(list.filter((m) => m.active)));
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
      await materialTransfersApi.create({
        ...form,
        lines: form.lines.filter((l) => l.materialId && l.quantity).map((l) => ({ materialId: l.materialId, quantity: l.quantity })),
      });
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('materialsInventory.transfers.title')} actions={
      <Can module="traslados_material" action="create">
        <Button onClick={() => (showForm ? setShowForm(false) : setShowForm(true))}>
          {showForm ? t('common.cancel') : t('materialsInventory.transfers.newTransfer')}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label={t('materialsInventory.transfers.from')} value={form.fromWarehouseId} onChange={(e) => setForm({ ...form, fromWarehouseId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Select label={t('materialsInventory.transfers.to')} value={form.toWarehouseId} onChange={(e) => setForm({ ...form, toWarehouseId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {warehouses.filter((w) => w.id !== form.fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <Input label={t('materialsInventory.transfers.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
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
                <Button type="button" variant="danger" onClick={() => removeLine(idx)}>{t('common.remove')}</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addLine}>{t('materialsInventory.transfers.addItem')}</Button>
          </div>
          <Input label={t('materialsInventory.transfers.observations')} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          <div className="flex items-center gap-3">
            <Button type="submit" loading={submitting}>{t('common.save')}</Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      )}

      <Table columns={[t('materialsInventory.transfers.date'), t('materialsInventory.transfers.from'), t('materialsInventory.transfers.to'), t('materialsInventory.catalog.status'), '']}>
        {transfers.map((tr) => (
          <Fragment key={tr.id}>
            <tr className="border-b border-gray-100">
              <td className="py-1 pr-3">{formatDate(tr.date)}</td>
              <td className="py-1 pr-3">{tr.fromWarehouse?.name}</td>
              <td className="py-1 pr-3">{tr.toWarehouse?.name}</td>
              <td className="py-1 pr-3"><Badge color={STATUS_COLORS[tr.status]}>{t(`materialsInventory.transfers.status.${tr.status}`)}</Badge></td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <a className="text-blue-600 hover:underline text-xs mr-2" href={materialTransfersApi.pdfUrl(tr.id)} target="_blank" rel="noreferrer">{t('common.view')}</a>
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedId(expandedId === tr.id ? null : tr.id)}>
                  {expandedId === tr.id ? t('materialsInventory.stock.hideLots') : t('materialsInventory.transfers.detail')}
                </button>
              </td>
            </tr>
            {expandedId === tr.id && <TransferDetail transfer={tr} onChange={load} />}
          </Fragment>
        ))}
        {transfers.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('materialsInventory.transfers.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

function TransferDetail({ transfer, onChange }) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // 'confirm' | 'reject' | 'link' | 'void'
  const [receivedByLine, setReceivedByLine] = useState(() => Object.fromEntries(transfer.lines.map((l) => [l.id, l.quantitySent])));
  const [shortageObservation, setShortageObservation] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [voidObservation, setVoidObservation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkResult, setLinkResult] = useState(null);

  const [doConfirm, confirming] = useSubmitGuard(async ({ signatureDataUrl, signerName }) => {
    setError('');
    await materialTransfersApi.confirm(transfer.id, { receivedByLine, shortageObservation, signatureDataUrl, signerName });
    setMode(null);
    onChange();
  });

  const [doReject, rejecting] = useSubmitGuard(async () => {
    setError('');
    if (!rejectionReason.trim()) { setError(t('materialsInventory.transfers.rejectReasonRequired')); return; }
    await materialTransfersApi.reject(transfer.id, rejectionReason);
    setMode(null);
    onChange();
  });

  const [doRequestLink, requestingLink] = useSubmitGuard(async () => {
    setError('');
    try {
      const res = await materialTransfersApi.requestSignature(transfer.id, { email: email || null, phone: phone || null });
      setLinkResult(res);
    } catch (err) {
      setError(extractError(err));
    }
  });

  const [doVoid, voiding] = useSubmitGuard(async () => {
    setError('');
    if (!voidObservation.trim()) { setError(t('materialsInventory.audit.observationRequired')); return; }
    try {
      await materialTransfersApi.voidSigned(transfer.id, voidObservation);
      setMode(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const isPending = transfer.status === 'en_transito';

  return (
    <tr className="border-b border-gray-100 bg-gray-50">
      <td colSpan={5} className="py-3 px-3">
        <Table columns={[t('materialsInventory.catalog.name'), t('materialsInventory.transfers.sent'), t('materialsInventory.transfers.received'), t('materialsInventory.stock.unitCost')]}>
          {transfer.lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{l.Material?.name}</td>
              <td className="py-1 pr-3">{Number(l.quantitySent)}</td>
              <td className="py-1 pr-3">
                {isPending ? (
                  <input
                    type="number" min="0" max={l.quantitySent} step="any"
                    className="w-20 border border-gray-300 rounded px-1 py-0.5 text-sm"
                    value={receivedByLine[l.id]}
                    onChange={(e) => setReceivedByLine((r) => ({ ...r, [l.id]: e.target.value }))}
                  />
                ) : (l.quantityReceived != null ? Number(l.quantityReceived) : '-')}
              </td>
              <td className="py-1 pr-3">{money(l.unitCost)}</td>
            </tr>
          ))}
        </Table>
        {transfer.observations && <p className="text-xs text-gray-500 mt-2">{t('materialsInventory.transfers.observations')}: {transfer.observations}</p>}
        {transfer.shortageObservation && <p className="text-xs text-amber-700 mt-1">{t('materialsInventory.transfers.shortageObservation')}: {transfer.shortageObservation}</p>}
        {transfer.rejectionReason && <p className="text-xs text-red-700 mt-1">{t('materialsInventory.transfers.rejectReason')}: {transfer.rejectionReason}</p>}

        {isPending && (
          <Can module="traslados_material" action="edit">
            <div className="mt-3 flex gap-2">
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setMode(mode === 'confirm' ? null : 'confirm')}>{t('materialsInventory.transfers.confirmNow')}</button>
              <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setMode(mode === 'reject' ? null : 'reject')}>{t('materialsInventory.transfers.rejectAction')}</button>
              <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setMode(mode === 'link' ? null : 'link')}>{t('voucherSignature.sendToSign')}</button>
            </div>
            <ErrorText>{error}</ErrorText>

            {mode === 'confirm' && (
              <div className="mt-2 max-w-xs border border-blue-200 bg-blue-50/50 rounded p-3">
                <Input label={t('materialsInventory.transfers.shortageObservation')} value={shortageObservation} onChange={(e) => setShortageObservation(e.target.value)} className="mb-2" />
                <SignaturePad onSubmit={doConfirm} submitting={confirming} submitLabel={t('materialsInventory.transfers.confirmNow')} />
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
                  <div className="text-xs mt-2">
                    <p className="text-gray-600 break-all">{t('voucherSignature.copyLink')}: <a className="text-blue-600 hover:underline" href={linkResult.signUrl} target="_blank" rel="noreferrer">{linkResult.signUrl}</a></p>
                  </div>
                )}
              </div>
            )}
          </Can>
        )}

        {transfer.status === 'confirmado' && isAdmin && (
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
