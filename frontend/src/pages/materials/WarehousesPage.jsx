import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { warehousesApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', location: '', managerName: '', managerPhone: '', managerEmail: '' };

// CRUD de bodegas (Inventario de Materiales). "Bodega Principal" (isDefault) la crea el sistema
// automáticamente (ver companyProvisioningService.js/postSyncFixups.js) y no se puede eliminar ni
// desactivar (ver warehouseController.js) — por eso no hay botón de eliminar acá, solo
// activar/desactivar para las demás, mismo criterio que CashBoxesPage.jsx.
export default function WarehousesPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => warehousesApi.list().then(setWarehouses);
  useEffect(() => { load(); }, []);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (w) => {
    setForm({ name: w.name, location: w.location || '', managerName: w.managerName || '', managerPhone: w.managerPhone || '', managerEmail: w.managerEmail || '' });
    setEditingId(w.id);
    setShowForm(true);
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await warehousesApi.update(editingId, form);
      else await warehousesApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleActive = async (w) => {
    setError('');
    try {
      await warehousesApi.update(w.id, { active: !w.active });
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('materialsInventory.warehouses.title')} actions={
      <Can module="bodegas" action="create">
        <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? t('common.cancel') : t('materialsInventory.warehouses.newWarehouse')}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4 items-end">
          <Input label={t('materialsInventory.warehouses.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('materialsInventory.warehouses.location')} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input label={t('materialsInventory.warehouses.managerName')} value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
          <Input label={t('materialsInventory.warehouses.managerPhone')} value={form.managerPhone} onChange={(e) => setForm({ ...form, managerPhone: e.target.value })} />
          <Input label={t('materialsInventory.warehouses.managerEmail')} type="email" value={form.managerEmail} onChange={(e) => setForm({ ...form, managerEmail: e.target.value })} />
          <Button type="submit" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('materialsInventory.warehouses.name'), t('materialsInventory.warehouses.location'), t('materialsInventory.warehouses.managerName'), t('materialsInventory.warehouses.status'), '']}>
        {warehouses.map((w) => (
          <tr key={w.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{w.name}{w.isDefault && <Badge color="blue">{t('materialsInventory.warehouses.default')}</Badge>}</td>
            <td className="py-1 pr-3">{w.location || '-'}</td>
            <td className="py-1 pr-3">{w.managerName || '-'}</td>
            <td className="py-1 pr-3"><Badge color={w.active ? 'green' : 'gray'}>{t(w.active ? 'materialsInventory.warehouses.active' : 'materialsInventory.warehouses.inactive')}</Badge></td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Can module="bodegas" action="edit">
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(w)}>{t('common.edit')}</button>
                {!w.isDefault && (
                  <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => toggleActive(w)}>
                    {w.active ? t('materialsInventory.warehouses.deactivate') : t('materialsInventory.warehouses.activate')}
                  </button>
                )}
              </Can>
            </td>
          </tr>
        ))}
        {warehouses.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('materialsInventory.warehouses.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
