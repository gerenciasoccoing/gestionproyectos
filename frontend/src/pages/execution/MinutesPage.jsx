import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { minutesApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, Badge, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

const TYPES = ['inicio', 'suspension', 'reinicio', 'terminacion', 'final', 'liquidacion'];

export default function MinutesPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [minutes, setMinutes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'inicio', date: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const load = () => minutesApi.list(projectId).then(setMinutes);
  useEffect(() => { load(); }, [projectId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError(t('execution.minutes.missingFile')); return; }
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('date', form.date);
      fd.append('file', file);
      await minutesApi.create(projectId, fd);
      setForm({ type: 'inicio', date: '' });
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (id) => {
    if (!confirm(t('execution.minutes.confirmDelete'))) return;
    await minutesApi.remove(projectId, id);
    load();
  };

  return (
    <Card title={t('execution.minutes.title')} actions={
      <Can module="ejecucion" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('execution.minutes.add')}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Select label={t('execution.minutes.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((type) => <option key={type} value={type}>{t(`execution.minutes.types.${type}`)}</option>)}
          </Select>
          <Input label={t('execution.minutes.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label={t('execution.minutes.document')} type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} required />
          <Button type="submit" className="col-span-full">{t('execution.minutes.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('execution.minutes.table.type'), t('execution.minutes.table.date'), t('execution.minutes.table.document'), '']}>
        {minutes.map((m) => (
          <tr key={m.id} className="border-b border-gray-100">
            <td className="py-2 pr-3"><Badge>{t(`execution.minutes.types.${m.type}`, m.type)}</Badge></td>
            <td className="py-2 pr-3">{formatDate(m.date)}</td>
            <td className="py-2 pr-3"><a className="text-blue-600 hover:underline" href={fileUrl(m.filePath)} target="_blank" rel="noreferrer">{t('execution.minutes.viewPdf')}</a></td>
            <td className="py-2 pr-3 text-right">
              <Can module="ejecucion" action="delete"><Button variant="danger" onClick={() => remove(m.id)}>{t('common.delete')}</Button></Can>
            </td>
          </tr>
        ))}
        {minutes.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">{t('execution.minutes.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
