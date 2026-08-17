import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { projectsApi, thirdPartiesApi } from '../api';
import { Card, Button, Input, SearchSelect, Table, Badge, ErrorText, extractError } from '../components/ui';
import Can from '../components/Can';
import MotivationalBanner from '../components/MotivationalBanner';

export default function ProjectsListPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', client: '', clientId: '', description: '' });
  const [error, setError] = useState('');

  const load = () => projectsApi.list().then(setProjects);
  useEffect(() => {
    load();
    thirdPartiesApi.list({ type: 'cliente' }).then(setClients);
  }, []);

  const pickClient = (clientId) => {
    const c = clients.find((x) => x.id === clientId);
    setForm((f) => ({ ...f, clientId, client: c ? c.name : f.client }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await projectsApi.create({ ...form, clientId: form.clientId || undefined });
      setForm({ name: '', client: '', clientId: '', description: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('projects.confirmDelete'))) return;
    await projectsApi.remove(id);
    load();
  };

  return (
    <div>
      <MotivationalBanner />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">{t('projects.title')}</h1>
        <Can module="proyectos" action="create">
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('projects.newProject')}</Button>
        </Can>
      </div>

      {showForm && (
        <Card title={t('projects.createManual')}>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <Input label={t('projects.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <SearchSelect
              label={t('projects.registeredClient')}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              value={form.clientId}
              onChange={pickClient}
              placeholder={t('projects.clientPlaceholder')}
            />
            <Input label={t('projects.client')} value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value, clientId: '' })} />
            <Input label={t('projects.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Button type="submit">{t('common.save')}</Button>
          </form>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}

      <Card>
        <Table columns={[t('projects.table.name'), t('projects.table.client'), t('projects.table.status'), t('projects.table.origin'), t('projects.table.users'), '']}>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">
                <Link to={`/projects/${p.id}/contractual`} className="text-blue-600 hover:underline font-medium">{p.name}</Link>
              </td>
              <td className="py-2 pr-3">{p.client || '-'}</td>
              <td className="py-2 pr-3"><Badge color={p.status === 'activo' ? 'green' : 'gray'}>{t(`enums.projectStatus.${p.status}`, p.status)}</Badge></td>
              <td className="py-2 pr-3">{p.origin === 'cotizacion' ? t('projects.originQuotation') : t('projects.originManual')}</td>
              <td className="py-2 pr-3">{p.Users?.length || 0}</td>
              <td className="py-2 pr-3 text-right">
                <Can module="proyectos" action="delete">
                  <Button variant="danger" onClick={() => handleDelete(p.id)}>{t('common.delete')}</Button>
                </Can>
              </td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-gray-400">{t('projects.empty')}</td></tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
