import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { consortiumsApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError } from '../../components/ui';
import { fileUrl } from '../../api/client';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', nit: '', address: '', phone: '', legalRepName: '' };

// CRUD de Consorcios/Uniones Temporales — entidades contratantes alternas a la empresa principal,
// asignables a un proyecto para que sus documentos generados (órdenes, contratos/nómina/
// liquidación, cotizaciones/presupuestos, informes) usen este membrete en vez del de la empresa
// principal (ver ProjectLayout.jsx y ProjectsListPage.jsx para el selector).
export default function ConsortiumsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [logo, setLogo] = useState(null);
  const [error, setError] = useState('');

  const load = () => consortiumsApi.list().then(setItems);
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setLogo(null);
    setEditingId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name, nit: item.nit || '', address: item.address || '',
      phone: item.phone || '', legalRepName: item.legalRepName || '',
    });
    setLogo(null);
    setShowForm(true);
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logo) fd.append('logo', logo);
      if (editingId) await consortiumsApi.update(editingId, fd);
      else await consortiumsApi.create(fd);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (item) => {
    if (!window.confirm(t('admin.consortiums.confirmDelete', { name: item.name }))) return;
    setError('');
    try {
      await consortiumsApi.remove(item.id);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('admin.consortiums.title')} actions={
      <Button onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s); }}>
        {showForm ? t('common.cancel') : t('admin.consortiums.add')}
      </Button>
    }>
      <p className="text-sm text-gray-500 mb-3">{t('admin.consortiums.help')}</p>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4 border rounded p-3 bg-gray-50">
          <Input label={t('admin.consortiums.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('admin.consortiums.nit')} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
          <Input label={t('admin.consortiums.legalRepName')} value={form.legalRepName} onChange={(e) => setForm({ ...form, legalRepName: e.target.value })} />
          <Input label={t('admin.consortiums.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label={t('admin.consortiums.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t('admin.consortiums.logo')} type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0])} />
          <Button type="submit" className="col-span-full w-fit" loading={submitting}>{editingId ? t('common.saveChanges') : t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}

      <Table columns={[t('admin.consortiums.table.logo'), t('admin.consortiums.table.name'), t('admin.consortiums.table.nit'), t('admin.consortiums.table.legalRepName'), '']}>
        {items.map((it) => (
          <tr key={it.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{it.logoPath ? <img src={fileUrl(it.logoPath)} alt={it.name} className="h-8" /> : '-'}</td>
            <td className="py-1 pr-3">{it.name}</td>
            <td className="py-1 pr-3">{it.nit || '-'}</td>
            <td className="py-1 pr-3">{it.legalRepName || '-'}</td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Button variant="secondary" onClick={() => startEdit(it)}>{t('common.edit')}</Button>
              <Button variant="danger" className="ml-2" onClick={() => remove(it)}>{t('common.delete')}</Button>
            </td>
          </tr>
        ))}
        {items.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('admin.consortiums.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
