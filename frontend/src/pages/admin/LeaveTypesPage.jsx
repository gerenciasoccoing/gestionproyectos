import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { leaveTypesApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', defaultDurationDays: '', paidBy: 'empleador' };

// Catálogo de tipos de licencia remunerada (Administración > Parámetros > Licencias), usado al
// registrar una novedad de tipo licencia_remunerada en la ficha de un trabajador (ver
// EmployeeDetailPage.jsx#LeavesSection). No se elimina un tipo ya usado en una novedad — solo se
// desactiva (setStatus), igual que Retenciones/Categorías de Gastos Admin.
export default function LeaveTypesPage() {
  const { t } = useTranslation();
  const [types, setTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => leaveTypesApi.list().then(setTypes);
  useEffect(() => { load(); }, []);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (type) => {
    setForm({ name: type.name, defaultDurationDays: type.defaultDurationDays ?? '', paidBy: type.paidBy });
    setEditingId(type.id);
    setShowForm(true);
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await leaveTypesApi.update(editingId, form);
      else await leaveTypesApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (type) => {
    await leaveTypesApi.setStatus(type.id, !type.active);
    load();
  };

  return (
    <Card title={t('admin.leaveTypes.title')} actions={
      <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
        {showForm ? t('common.cancel') : t('admin.leaveTypes.newType')}
      </Button>
    }>
      <p className="text-sm text-gray-500 mb-3">{t('admin.leaveTypes.help')}</p>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 items-end">
          <Input label={t('admin.leaveTypes.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('admin.leaveTypes.defaultDurationDays')} type="number" min="0" step="1" value={form.defaultDurationDays} onChange={(e) => setForm({ ...form, defaultDurationDays: e.target.value })} />
          <Select label={t('admin.leaveTypes.paidBy')} value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })}>
            <option value="empleador">{t('admin.leaveTypes.paidByOptions.empleador')}</option>
            <option value="eps">{t('admin.leaveTypes.paidByOptions.eps')}</option>
            <option value="arl">{t('admin.leaveTypes.paidByOptions.arl')}</option>
          </Select>
          <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('admin.leaveTypes.table.name'), t('admin.leaveTypes.table.defaultDurationDays'), t('admin.leaveTypes.table.paidBy'), t('admin.leaveTypes.table.status'), '']}>
        {types.map((type) => (
          <tr key={type.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{type.name}</td>
            <td className="py-1 pr-3">{type.defaultDurationDays ?? '-'}</td>
            <td className="py-1 pr-3">{t(`admin.leaveTypes.paidByOptions.${type.paidBy}`, type.paidBy)}</td>
            <td className="py-1 pr-3"><Badge color={type.active ? 'green' : 'gray'}>{t(type.active ? 'admin.leaveTypes.active' : 'admin.leaveTypes.inactive')}</Badge></td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(type)}>{t('common.edit')}</button>
              <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => toggleStatus(type)}>
                {type.active ? t('admin.leaveTypes.deactivate') : t('admin.leaveTypes.activate')}
              </button>
            </td>
          </tr>
        ))}
        {types.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('admin.leaveTypes.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
