import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryCheckoutsApi, inventoryItemsApi, projectsApi, thirdPartiesApi, employeesApi } from '../../api';
import { Card, Button, Input, Select, SearchSelect, TextArea, Table, Badge, ErrorText, extractError, formatDate } from '../../components/ui';
import Can from '../../components/Can';

const STATUS_COLORS = { activa: 'yellow', cerrada: 'green' };
const CONDITIONS = ['bueno', 'dañado', 'incompleto'];
const RESULT_STATUSES = ['disponible', 'mantenimiento', 'baja'];

function emptyLine() { return { inventoryItemId: '', quantity: '1' }; }
const emptyForm = {
  projectId: '', destinationText: '', responsibleEmployeeId: '', responsibleThirdPartyId: '', responsibleName: '',
  checkoutDate: '', notes: '', items: [emptyLine()],
};

function destinoLabel(checkout) {
  return checkout.Project?.name || checkout.destinationText || '-';
}
function responsableLabel(checkout) {
  return checkout.responsibleEmployee?.name || checkout.responsibleThirdParty?.name || checkout.responsibleName || '-';
}

export default function InventoryCheckoutsPage() {
  const { t } = useTranslation();
  const [checkouts, setCheckouts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [invItems, setInvItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [thirdParties, setThirdParties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [notify, setNotify] = useState(null); // { checkoutId, numero, preview }

  const load = () => inventoryCheckoutsApi.list(statusFilter ? { status: statusFilter } : {}).then(setCheckouts);
  useEffect(() => { load(); }, [statusFilter]);
  useEffect(() => {
    inventoryItemsApi.list().then(setInvItems);
    projectsApi.list().then(setProjects);
    thirdPartiesApi.list().then(setThirdParties);
  }, []);
  useEffect(() => {
    if (form.projectId) employeesApi.list(form.projectId).then(setEmployees);
    else setEmployees([]);
  }, [form.projectId]);

  const resetForm = () => { setForm(emptyForm); setEmployees([]); };

  const updateLine = (idx, field, value) => setForm((f) => {
    const items = [...f.items];
    items[idx] = { ...items[idx], [field]: value };
    return { ...f, items };
  });
  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, emptyLine()] }));
  const removeLine = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        projectId: form.projectId || undefined,
        destinationText: form.destinationText || undefined,
        responsibleEmployeeId: form.responsibleEmployeeId || undefined,
        responsibleThirdPartyId: form.responsibleThirdPartyId || undefined,
        responsibleName: form.responsibleName || undefined,
        checkoutDate: form.checkoutDate ? new Date(form.checkoutDate).toISOString() : undefined,
        notes: form.notes || undefined,
        items: form.items.filter((l) => l.inventoryItemId).map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity })),
      };
      const created = await inventoryCheckoutsApi.create(payload);
      resetForm();
      setShowForm(false);
      load();
      setNotify({ checkoutId: created.id, kind: 'salida', numero: '', preview: '', result: null });
    } catch (err) {
      setError(extractError(err));
    }
  };

  const sendNotify = async () => {
    if (!notify) return;
    try {
      const res = notify.kind === 'salida'
        ? await inventoryCheckoutsApi.notifySalida(notify.checkoutId, notify.numero)
        : await inventoryCheckoutsApi.notifyEntrada(notify.checkoutId, notify.numero, notify.checkinIds);
      setNotify({ ...notify, preview: res.preview, result: res });
    } catch (err) {
      setNotify({ ...notify, result: { ok: false, error: extractError(err) } });
    }
  };

  return (
    <div>
      <Card title={t('inventory.checkouts.title')} actions={
        <Can module="inventario" action="create">
          <Button onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s); }}>
            {showForm ? t('common.cancel') : t('inventory.checkouts.newCheckout')}
          </Button>
        </Can>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              <SearchSelect
                label={t('inventory.checkouts.fields.project')}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                value={form.projectId}
                onChange={(v) => setForm({ ...form, projectId: v, responsibleEmployeeId: '' })}
                placeholder={t('inventory.checkouts.noProjectPlaceholder')}
              />
              <Input label={t('inventory.checkouts.fields.destinationText')} value={form.destinationText} onChange={(e) => setForm({ ...form, destinationText: e.target.value })} />
              <Input label={t('inventory.checkouts.fields.checkoutDate')} type="datetime-local" value={form.checkoutDate} onChange={(e) => setForm({ ...form, checkoutDate: e.target.value })} />
              <SearchSelect
                label={t('inventory.checkouts.fields.responsibleEmployee')}
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
                value={form.responsibleEmployeeId}
                onChange={(v) => setForm({ ...form, responsibleEmployeeId: v })}
                placeholder={form.projectId ? t('inventory.checkouts.nonePlaceholder') : t('inventory.checkouts.selectProjectFirst')}
                disabled={!form.projectId}
              />
              <SearchSelect
                label={t('inventory.checkouts.fields.responsibleThirdParty')}
                options={thirdParties.map((tp) => ({ value: tp.id, label: tp.name }))}
                value={form.responsibleThirdPartyId}
                onChange={(v) => setForm({ ...form, responsibleThirdPartyId: v })}
                placeholder={t('inventory.checkouts.nonePlaceholder')}
              />
              <Input label={t('inventory.checkouts.fields.responsibleName')} value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} placeholder={t('inventory.checkouts.responsibleNameHelp')} />
              <TextArea label={t('inventory.checkouts.fields.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="col-span-full" rows={2} />
            </div>

            <p className="text-sm font-medium text-gray-600 mb-2">{t('inventory.checkouts.items')}</p>
            {form.items.map((line, idx) => {
              const selected = invItems.find((it) => it.id === line.inventoryItemId);
              return (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 items-end">
                  <SearchSelect
                    className="col-span-2 sm:col-span-2"
                    label={t('inventory.checkouts.fields.item')}
                    options={invItems.map((it) => ({ value: it.id, label: `${it.code} - ${it.name}` }))}
                    value={line.inventoryItemId}
                    onChange={(v) => updateLine(idx, 'inventoryItemId', v)}
                  />
                  {selected?.trackingType === 'cantidad' ? (
                    <Input
                      label={t('inventory.checkouts.fields.quantity')} type="number" min="0.01" step="0.01"
                      value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                    />
                  ) : (
                    <div className="text-sm text-gray-400 pb-1.5">{t('inventory.checkouts.serializedNote')}</div>
                  )}
                  <Button type="button" variant="danger" onClick={() => removeLine(idx)}>{t('common.remove')}</Button>
                </div>
              );
            })}
            <Button type="button" variant="secondary" onClick={addLine}>{t('inventory.checkouts.addItem')}</Button>
            <Button type="submit" className="ml-2">{t('inventory.checkouts.save')}</Button>
            <ErrorText>{error}</ErrorText>
          </form>
        )}

        {notify && (
          <div className="mb-4 border rounded p-3 bg-blue-50 border-blue-200">
            <p className="text-sm font-medium text-blue-900 mb-2">
              {notify.kind === 'entrada' ? t('inventory.checkouts.notifyEntradaTitle') : t('inventory.checkouts.notifySalidaTitle')}
            </p>
            <div className="flex flex-wrap gap-2 items-end mb-2">
              <Input label={t('inventory.checkouts.whatsappNumber')} value={notify.numero} onChange={(e) => setNotify({ ...notify, numero: e.target.value })} placeholder="573001234567" />
              <Button type="button" onClick={sendNotify} disabled={!notify.numero}>{t('inventory.checkouts.sendWhatsapp')}</Button>
              <Button type="button" variant="secondary" onClick={() => setNotify(null)}>{t('common.close')}</Button>
            </div>
            {notify.result && (
              notify.result.ok
                ? <p className="text-sm text-green-700">{t('inventory.checkouts.sendSuccess')}</p>
                : <p className="text-sm text-red-700">{t('inventory.checkouts.sendFailed')}: {notify.result.error}</p>
            )}
            {notify.preview && (
              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-white border rounded p-2 mt-2">{notify.preview}</pre>
            )}
          </div>
        )}

        <Select label={t('inventory.checkouts.filterStatus')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-56 mb-3">
          <option value="">{t('inventory.checkouts.allStatuses')}</option>
          <option value="activa">{t('inventory.statuses.activa')}</option>
          <option value="cerrada">{t('inventory.statuses.cerrada')}</option>
        </Select>

        <Table columns={[
          t('inventory.checkouts.table.destination'), t('inventory.checkouts.table.responsible'),
          t('inventory.checkouts.table.date'), t('inventory.checkouts.table.status'), t('inventory.checkouts.table.items'), '',
        ]}>
          {checkouts.map((c) => (
            <tr key={c.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{destinoLabel(c)}</td>
              <td className="py-1 pr-3">{responsableLabel(c)}</td>
              <td className="py-1 pr-3">{formatDate(c.checkoutDate?.slice(0, 10))}</td>
              <td className="py-1 pr-3"><Badge color={STATUS_COLORS[c.status]}>{t(`inventory.statuses.${c.status}`)}</Badge></td>
              <td className="py-1 pr-3">{c.items?.length || 0}</td>
              <td className="py-1 pr-3 text-right">
                <Button variant="secondary" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  {expandedId === c.id ? t('common.close') : t('inventory.checkouts.detail')}
                </Button>
              </td>
            </tr>
          ))}
          {checkouts.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('inventory.checkouts.empty')}</td></tr>}
        </Table>
      </Card>

      {expandedId && (
        <CheckoutDetail
          checkoutId={expandedId}
          onChange={load}
          onNotifyEntrada={(checkoutId, checkinIds) => setNotify({ checkoutId, kind: 'entrada', numero: '', preview: '', result: null, checkinIds })}
        />
      )}
    </div>
  );
}

function CheckoutDetail({ checkoutId, onChange, onNotifyEntrada }) {
  const { t } = useTranslation();
  const [checkout, setCheckout] = useState(null);
  const [returnForms, setReturnForms] = useState({});
  const [justifyForms, setJustifyForms] = useState({});
  const [error, setError] = useState('');

  const load = () => inventoryCheckoutsApi.get(checkoutId).then(setCheckout);
  useEffect(() => { load(); }, [checkoutId]);

  if (!checkout) return null;

  const pendingOf = (it) => Number(it.quantity) - Number(it.returnedQuantity) - Number(it.justifiedMissingQuantity);

  const submitReturn = async (checkoutItemId) => {
    setError('');
    const data = returnForms[checkoutItemId] || {};
    if (!data.quantity || !data.condition || !data.resultingStatus) {
      setError(t('inventory.checkouts.returnRequired'));
      return;
    }
    try {
      const res = await inventoryCheckoutsApi.checkin(checkoutId, {
        returns: [{ checkoutItemId, quantity: data.quantity, condition: data.condition, resultingStatus: data.resultingStatus, notes: data.notes }],
      });
      setReturnForms((f) => ({ ...f, [checkoutItemId]: {} }));
      load();
      onChange();
      onNotifyEntrada(checkoutId, res.checkins.map((c) => c.id));
    } catch (err) {
      setError(extractError(err));
    }
  };

  const submitJustify = async (checkoutItemId) => {
    setError('');
    const data = justifyForms[checkoutItemId] || {};
    if (!data.quantity || !data.note) {
      setError(t('inventory.checkouts.justifyRequired'));
      return;
    }
    try {
      await inventoryCheckoutsApi.justify(checkoutId, checkoutItemId, { quantity: data.quantity, note: data.note });
      setJustifyForms((f) => ({ ...f, [checkoutItemId]: {} }));
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('inventory.checkouts.detailTitle', { destination: destinoLabel(checkout) })}>
      {checkout.notes && <p className="text-sm text-gray-500 mb-3">{t('inventory.checkouts.fields.notes')}: {checkout.notes}</p>}
      <Table columns={[
        t('inventory.checkouts.detailTable.item'), t('inventory.checkouts.detailTable.quantity'),
        t('inventory.checkouts.detailTable.returned'), t('inventory.checkouts.detailTable.justified'),
        t('inventory.checkouts.detailTable.pending'), t('inventory.checkouts.detailTable.action'),
      ]}>
        {checkout.items.map((it) => {
          const pending = pendingOf(it);
          return (
            <tr key={it.id} className="border-b border-gray-100 align-top">
              <td className="py-2 pr-3">{it.InventoryItem.name} <span className="text-gray-400">({it.InventoryItem.code})</span></td>
              <td className="py-2 pr-3">{Number(it.quantity)}</td>
              <td className="py-2 pr-3">{Number(it.returnedQuantity)}</td>
              <td className="py-2 pr-3">{Number(it.justifiedMissingQuantity)}</td>
              <td className="py-2 pr-3">{pending}</td>
              <td className="py-2 pr-3">
                {pending <= 0.0001 ? (
                  <Badge color="green">{t('inventory.checkouts.resolved')}</Badge>
                ) : (
                  <Can module="inventario" action="edit">
                    <div className="flex flex-wrap gap-2 mb-2 items-end">
                      <Input
                        type="number" min="0.01" step="0.01" max={pending} placeholder={t('inventory.checkouts.detailTable.quantity')}
                        value={returnForms[it.id]?.quantity || ''}
                        onChange={(e) => setReturnForms((f) => ({ ...f, [it.id]: { ...f[it.id], quantity: e.target.value } }))}
                        className="w-24"
                      />
                      <Select
                        value={returnForms[it.id]?.condition || ''}
                        onChange={(e) => setReturnForms((f) => ({ ...f, [it.id]: { ...f[it.id], condition: e.target.value } }))}
                      >
                        <option value="">{t('inventory.checkouts.conditionPlaceholder')}</option>
                        {CONDITIONS.map((c) => <option key={c} value={c}>{t(`inventory.conditions.${c}`)}</option>)}
                      </Select>
                      <Select
                        value={returnForms[it.id]?.resultingStatus || ''}
                        onChange={(e) => setReturnForms((f) => ({ ...f, [it.id]: { ...f[it.id], resultingStatus: e.target.value } }))}
                      >
                        <option value="">{t('inventory.checkouts.resultingStatusPlaceholder')}</option>
                        {RESULT_STATUSES.map((s) => <option key={s} value={s}>{t(`inventory.statuses.${s}`)}</option>)}
                      </Select>
                      <Button type="button" onClick={() => submitReturn(it.id)}>{t('inventory.checkouts.registerReturn')}</Button>
                    </div>
                    <div className="flex flex-wrap gap-2 items-end">
                      <Input
                        type="number" min="0.01" step="0.01" max={pending} placeholder={t('inventory.checkouts.justifyQuantity')}
                        value={justifyForms[it.id]?.quantity || ''}
                        onChange={(e) => setJustifyForms((f) => ({ ...f, [it.id]: { ...f[it.id], quantity: e.target.value } }))}
                        className="w-24"
                      />
                      <Input
                        placeholder={t('inventory.checkouts.justifyNote')}
                        value={justifyForms[it.id]?.note || ''}
                        onChange={(e) => setJustifyForms((f) => ({ ...f, [it.id]: { ...f[it.id], note: e.target.value } }))}
                      />
                      <Button type="button" variant="secondary" onClick={() => submitJustify(it.id)}>{t('inventory.checkouts.registerJustify')}</Button>
                    </div>
                  </Can>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
