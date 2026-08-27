import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryItemsApi } from '../../api';
import { Card, Button, Input, Select, TextArea, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const STATUS_COLORS = { disponible: 'green', en_prestamo: 'yellow', mantenimiento: 'blue', baja: 'red' };
const STATUSES = ['disponible', 'en_prestamo', 'mantenimiento', 'baja'];
const TRACKING_TYPES = ['serializado', 'cantidad'];

const emptyForm = { name: '', code: '', category: '', trackingType: 'serializado', value: '', stockQuantity: '', notes: '' };

export default function InventoryCatalogPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [historyId, setHistoryId] = useState(null);

  const load = () => inventoryItemsApi.list(search ? { search } : {}).then(setItems);
  useEffect(() => { load(); }, [search]);

  const resetForm = () => { setForm(emptyForm); setPhoto(null); setEditingId(null); };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name, code: item.code, category: item.category, trackingType: item.trackingType,
      value: item.value ?? '', stockQuantity: item.stockQuantity ?? '', notes: item.notes || '',
    });
    setPhoto(null);
    setShowForm(true);
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photo) fd.append('photo', photo);
      if (editingId) await inventoryItemsApi.update(editingId, fd);
      else await inventoryItemsApi.create(fd);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (id) => {
    if (!confirm(t('inventory.catalog.confirmDelete'))) return;
    try {
      await inventoryItemsApi.remove(id);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <div>
      <Card title={t('inventory.catalog.title')} actions={
        <Can module="inventario" action="create">
          <Button onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s); }}>
            {showForm ? t('common.cancel') : t('inventory.catalog.newItem')}
          </Button>
        </Can>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label={t('inventory.catalog.fields.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label={t('inventory.catalog.fields.code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              <Input label={t('inventory.catalog.fields.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
              <Select label={t('inventory.catalog.fields.trackingType')} value={form.trackingType} onChange={(e) => setForm({ ...form, trackingType: e.target.value })}>
                {TRACKING_TYPES.map((tt) => <option key={tt} value={tt}>{t(`inventory.trackingTypes.${tt}`)}</option>)}
              </Select>
              {form.trackingType === 'cantidad' && (
                <Input
                  label={t('inventory.catalog.fields.stockQuantity')} type="number" min="0" step="1"
                  value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} required
                />
              )}
              <Input label={t('inventory.catalog.fields.value')} type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              <Input label={t('inventory.catalog.fields.photo')} type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
              <TextArea label={t('inventory.catalog.fields.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="col-span-full" rows={2} />
              <Button type="submit" className="col-span-full" loading={submitting}>{editingId ? t('common.saveChanges') : t('common.save')}</Button>
              <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
            </div>
          </form>
        )}

        <Input label={t('inventory.catalog.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 mb-3" />

        <Table columns={[
          t('inventory.catalog.table.photo'), t('inventory.catalog.table.code'), t('inventory.catalog.table.name'),
          t('inventory.catalog.table.category'), t('inventory.catalog.table.status'), t('inventory.catalog.table.value'), '',
        ]}>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">
                {it.photoPath ? <img src={fileUrl(it.photoPath)} alt={it.name} className="w-10 h-10 object-cover rounded border" /> : <span className="text-gray-300 text-xs">-</span>}
              </td>
              <td className="py-1 pr-3 text-gray-400">{it.code}</td>
              <td className="py-1 pr-3">{it.name}</td>
              <td className="py-1 pr-3">{it.category}</td>
              <td className="py-1 pr-3">
                {it.trackingType === 'cantidad' ? (
                  <span className="text-sm">{t('inventory.catalog.availableOf', { available: Number(it.available), total: Number(it.stockQuantity) })}</span>
                ) : (
                  <Badge color={STATUS_COLORS[it.status]}>{t(`inventory.statuses.${it.status}`)}</Badge>
                )}
              </td>
              <td className="py-1 pr-3">{it.value ? money(it.value) : '-'}</td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <Button variant="secondary" onClick={() => setHistoryId(historyId === it.id ? null : it.id)}>
                  {historyId === it.id ? t('common.close') : t('inventory.catalog.history')}
                </Button>
                <Can module="inventario" action="edit">
                  <Button variant="secondary" className="ml-2" onClick={() => startEdit(it)}>{t('common.edit')}</Button>
                </Can>
                <Can module="inventario" action="delete">
                  <Button variant="danger" className="ml-2" onClick={() => remove(it.id)}>{t('common.delete')}</Button>
                </Can>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={7} className="py-3 text-center text-gray-400">{t('inventory.catalog.empty')}</td></tr>}
        </Table>
        <ErrorText>{!showForm ? error : ''}</ErrorText>
      </Card>

      {historyId && <ItemHistory itemId={historyId} />}
    </div>
  );
}

function ItemHistory({ itemId }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => { inventoryItemsApi.history(itemId).then(setData); }, [itemId]);
  if (!data) return null;

  return (
    <Card title={t('inventory.catalog.historyTitle', { name: data.item.name })}>
      <Table columns={[
        t('inventory.catalog.historyTable.date'), t('inventory.catalog.historyTable.destination'),
        t('inventory.catalog.historyTable.responsible'), t('inventory.catalog.historyTable.quantity'),
        t('inventory.catalog.historyTable.returned'), t('inventory.catalog.historyTable.status'),
      ]}>
        {data.lines.map((line) => {
          const checkout = line.checkout;
          const destino = checkout.Project?.name || checkout.destinationText || '-';
          const responsable = checkout.responsibleEmployee?.name || checkout.responsibleThirdParty?.name || checkout.responsibleName || '-';
          const pending = Number(line.quantity) - Number(line.returnedQuantity) - Number(line.justifiedMissingQuantity);
          return (
            <tr key={line.id} className="border-b border-gray-100 align-top">
              <td className="py-1 pr-3">{formatDate(checkout.checkoutDate?.slice(0, 10))}</td>
              <td className="py-1 pr-3">{destino}</td>
              <td className="py-1 pr-3">{responsable}</td>
              <td className="py-1 pr-3">{Number(line.quantity)}</td>
              <td className="py-1 pr-3">{Number(line.returnedQuantity)}</td>
              <td className="py-1 pr-3">
                {pending <= 0.0001 ? <Badge color="green">{t('inventory.catalog.resolved')}</Badge> : <Badge color="yellow">{t('inventory.catalog.pendingQty', { qty: pending })}</Badge>}
              </td>
            </tr>
          );
        })}
        {data.lines.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('inventory.catalog.noHistory')}</td></tr>}
      </Table>
    </Card>
  );
}
