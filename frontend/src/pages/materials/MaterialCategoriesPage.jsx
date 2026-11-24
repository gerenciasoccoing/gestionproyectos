import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialCategoriesApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '' };

// Categorías del Catálogo de Materiales — "Materiales" es la categoría por defecto de cada
// empresa, se siembra sola y nunca se puede eliminar ni desactivar (ver MaterialCategory.js). Una
// categoría con materiales asignados tampoco se puede eliminar: hay que reasignarlos primero desde
// el Catálogo (ver MaterialCatalogPage.jsx, acción masiva "cambiar categoría").
export default function MaterialCategoriesPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState({});

  const load = () => materialCategoriesApi.list().then(setCategories);
  useEffect(() => { load(); }, []);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (c) => { setForm({ name: c.name }); setEditingId(c.id); setShowForm(true); };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await materialCategoriesApi.update(editingId, form);
      else await materialCategoriesApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (c) => {
    try {
      await materialCategoriesApi.setStatus(c.id, !c.active);
      load();
    } catch (err) {
      setRowError({ ...rowError, [c.id]: extractError(err) });
    }
  };

  const remove = async (c) => {
    if (!confirm(t('materialsInventory.categories.confirmDelete', { name: c.name }))) return;
    try {
      await materialCategoriesApi.remove(c.id);
      load();
    } catch (err) {
      setRowError({ ...rowError, [c.id]: extractError(err) });
    }
  };

  return (
    <Card title={t('materialsInventory.categories.title')} actions={
      <Can module="inventario_materiales" action="create">
        <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? t('common.cancel') : t('materialsInventory.categories.newCategory')}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 items-end">
          <Input label={t('materialsInventory.categories.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Button type="submit" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('materialsInventory.categories.name'), t('materialsInventory.catalog.status'), t('materialsInventory.categories.materialCount'), '']}>
        {categories.map((c) => (
          <tr key={c.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{c.name}{c.isDefault && <span className="ml-2"><Badge color="blue">{t('materialsInventory.categories.default')}</Badge></span>}</td>
            <td className="py-1 pr-3"><Badge color={c.active ? 'green' : 'gray'}>{t(c.active ? 'materialsInventory.catalog.active' : 'materialsInventory.catalog.inactive')}</Badge></td>
            <td className="py-1 pr-3">{c.materialCount}</td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Can module="inventario_materiales" action="edit">
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(c)}>{t('common.edit')}</button>
                {!c.isDefault && (
                  <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => toggleStatus(c)}>
                    {c.active ? t('materialsInventory.catalog.deactivate') : t('materialsInventory.catalog.activate')}
                  </button>
                )}
              </Can>
              <Can module="inventario_materiales" action="delete">
                {!c.isDefault && (
                  <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => remove(c)}>{t('common.delete')}</button>
                )}
              </Can>
              {rowError[c.id] && <div><ErrorText>{rowError[c.id]}</ErrorText></div>}
            </td>
          </tr>
        ))}
        {categories.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">{t('materialsInventory.categories.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
