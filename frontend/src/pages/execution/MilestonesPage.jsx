import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { milestonesApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, Badge, formatDate } from '../../components/ui';
import Can from '../../components/Can';

export default function MilestonesPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [milestones, setMilestones] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', plannedDate: '' });
  const [error, setError] = useState('');

  const load = () => milestonesApi.list(projectId).then(setMilestones);
  useEffect(() => { load(); }, [projectId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await milestonesApi.create(projectId, form);
      setForm({ name: '', plannedDate: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const updateField = async (id, field, value) => {
    await milestonesApi.update(projectId, id, { [field]: value });
    load();
  };

  const remove = async (id) => {
    if (!confirm(t('execution.milestones.confirmDelete'))) return;
    await milestonesApi.remove(projectId, id);
    load();
  };

  const badgeColor = (status) => (status === 'cumplido' ? 'green' : status === 'atrasado' ? 'red' : 'yellow');

  return (
    <Card title={t('execution.milestones.title')} actions={
      <Can module="ejecucion" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('execution.milestones.add')}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Input label={t('execution.milestones.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('execution.milestones.plannedDate')} type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} required />
          <Button type="submit">{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('execution.milestones.table.name'), t('execution.milestones.table.planned'), t('execution.milestones.table.actual'), t('execution.milestones.table.status'), '']}>
        {milestones.map((m) => (
          <tr key={m.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{m.name}</td>
            <td className="py-2 pr-3">{formatDate(m.plannedDate)}</td>
            <td className="py-2 pr-3">
              <Can module="ejecucion" action="edit" fallback={formatDate(m.actualDate) || '-'}>
                <input type="date" defaultValue={m.actualDate || ''} onBlur={(e) => updateField(m.id, 'actualDate', e.target.value)} className="border rounded px-1 py-0.5 text-xs" />
              </Can>
            </td>
            <td className="py-2 pr-3">
              <Can module="ejecucion" action="edit" fallback={<Badge color={badgeColor(m.status)}>{t(`execution.milestones.status.${m.status}`, m.status)}</Badge>}>
                <Select value={m.status} onChange={(e) => updateField(m.id, 'status', e.target.value)}>
                  <option value="pendiente">{t('execution.milestones.status.pendiente')}</option>
                  <option value="cumplido">{t('execution.milestones.status.cumplido')}</option>
                  <option value="atrasado">{t('execution.milestones.status.atrasado')}</option>
                </Select>
              </Can>
            </td>
            <td className="py-2 pr-3 text-right">
              <Can module="ejecucion" action="delete"><Button variant="danger" onClick={() => remove(m.id)}>{t('common.delete')}</Button></Can>
            </td>
          </tr>
        ))}
        {milestones.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('execution.milestones.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
