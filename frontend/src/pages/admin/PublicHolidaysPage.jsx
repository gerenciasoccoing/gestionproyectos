import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { publicHolidaysApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError, formatDate } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { date: '', name: '' };

// Calendario de festivos de Colombia (Administración > Parámetros > Festivos) — sembrado
// automáticamente al arrancar/crear la empresa (algoritmo de Ley Emiliani, ver
// config/colombianHolidays.js en el backend), pero editable acá por si alguna fecha cambia. Usado
// por laborCalculations.js#countBusinessDays para el saldo de vacaciones (días hábiles = calendario
// menos domingos y festivos).
export default function PublicHolidaysPage() {
  const { t } = useTranslation();
  const [holidays, setHolidays] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const load = () => publicHolidaysApi.list(year).then(setHolidays);
  useEffect(() => { load(); }, [year]);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (h) => { setForm({ date: h.date, name: h.name }); setEditingId(h.id); setShowForm(true); };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await publicHolidaysApi.update(editingId, form);
      else await publicHolidaysApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (h) => {
    if (!window.confirm(t('admin.publicHolidays.confirmDelete'))) return;
    await publicHolidaysApi.remove(h.id);
    load();
  };

  return (
    <Card title={t('admin.publicHolidays.title')} actions={
      <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
        {showForm ? t('common.cancel') : t('admin.publicHolidays.newHoliday')}
      </Button>
    }>
      <p className="text-sm text-gray-500 mb-3">{t('admin.publicHolidays.help')}</p>
      <Input label={t('admin.publicHolidays.filterYear')} type="number" value={year} onChange={(e) => setYear(e.target.value)} className="mb-3 max-w-[160px]" />
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 items-end">
          <Input label={t('admin.publicHolidays.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label={t('admin.publicHolidays.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('admin.publicHolidays.table.date'), t('admin.publicHolidays.table.name'), '']}>
        {holidays.map((h) => (
          <tr key={h.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{formatDate(h.date)}</td>
            <td className="py-1 pr-3">{h.name}</td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(h)}>{t('common.edit')}</button>
              <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => remove(h)}>{t('common.delete')}</button>
            </td>
          </tr>
        ))}
        {holidays.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-gray-400">{t('admin.publicHolidays.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
