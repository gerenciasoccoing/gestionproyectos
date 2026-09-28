import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminExpenseCategoriesApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '' };

// Catálogo de categorías de Gasto Administrativo General (Administración > Parámetros), usado al
// registrar un gasto administrativo (ver ExpensesPage.jsx). No se elimina una categoría ya usada en
// un gasto — solo se desactiva (setStatus), mismo criterio que WithholdingTypesPage.jsx.
export default function AdminExpenseCategoriesPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminExpenseCategoriesApi.list().then(setCategories);
  useEffect(() => { load(); }, []);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (cat) => {
    setForm({ name: cat.name });
    setEditingId(cat.id);
    setShowForm(true);
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await adminExpenseCategoriesApi.update(editingId, form);
      else await adminExpenseCategoriesApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (cat) => {
    await adminExpenseCategoriesApi.setStatus(cat.id, !cat.active);
    load();
  };

  return (
    <Card title={t('admin.adminExpenseCategories.title')} actions={
      <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
        {showForm ? t('common.cancel') : t('admin.adminExpenseCategories.newCategory')}
      </Button>
    }>
      <p className="text-sm text-gray-500 mb-3">{t('admin.adminExpenseCategories.help')}</p>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 items-end">
          <Input label={t('admin.adminExpenseCategories.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Button type="submit" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('admin.adminExpenseCategories.table.name'), t('admin.adminExpenseCategories.table.status'), '']}>
        {categories.map((cat) => (
          <tr key={cat.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{cat.name}</td>
            <td className="py-1 pr-3"><Badge color={cat.active ? 'green' : 'gray'}>{t(cat.active ? 'admin.adminExpenseCategories.active' : 'admin.adminExpenseCategories.inactive')}</Badge></td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(cat)}>{t('common.edit')}</button>
              <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => toggleStatus(cat)}>
                {cat.active ? t('admin.adminExpenseCategories.deactivate') : t('admin.adminExpenseCategories.activate')}
              </button>
            </td>
          </tr>
        ))}
        {categories.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-gray-400">{t('admin.adminExpenseCategories.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
