import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialsApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', unit: '' };

// Catálogo de materiales del Inventario de Materiales — se auto-crea por nombre al recibir una OC
// (ver purchaseOrderController.js#addReceipt, Fase 2), y también es editable a mano acá. No se
// elimina un material ya usado en algún lote — solo se desactiva (setStatus), mismo criterio que
// AdminExpenseCategoriesPage.jsx.
export default function MaterialCatalogPage() {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => materialsApi.list().then(setMaterials);
  useEffect(() => { load(); }, []);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (m) => { setForm({ name: m.name, unit: m.unit || '' }); setEditingId(m.id); setShowForm(true); };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await materialsApi.update(editingId, form);
      else await materialsApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (m) => {
    await materialsApi.setStatus(m.id, !m.active);
    load();
  };

  return (
    <Card title={t('materialsInventory.catalog.title')} actions={
      <Can module="inventario_materiales" action="create">
        <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? t('common.cancel') : t('materialsInventory.catalog.newMaterial')}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 items-end">
          <Input label={t('materialsInventory.catalog.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('materialsInventory.catalog.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="m3, kg, un..." />
          <Button type="submit" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('materialsInventory.catalog.name'), t('materialsInventory.catalog.unit'), t('materialsInventory.catalog.status'), '']}>
        {materials.map((m) => (
          <tr key={m.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{m.name}</td>
            <td className="py-1 pr-3">{m.unit || '-'}</td>
            <td className="py-1 pr-3"><Badge color={m.active ? 'green' : 'gray'}>{t(m.active ? 'materialsInventory.catalog.active' : 'materialsInventory.catalog.inactive')}</Badge></td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Can module="inventario_materiales" action="edit">
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(m)}>{t('common.edit')}</button>
                <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => toggleStatus(m)}>
                  {m.active ? t('materialsInventory.catalog.deactivate') : t('materialsInventory.catalog.activate')}
                </button>
              </Can>
            </td>
          </tr>
        ))}
        {materials.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">{t('materialsInventory.catalog.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
