import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { projectsApi } from '../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError } from '../components/ui';
import Can from '../components/Can';

export default function ProjectsListPage() {
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', client: '', description: '' });
  const [error, setError] = useState('');

  const load = () => projectsApi.list().then(setProjects);
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await projectsApi.create(form);
      setForm({ name: '', client: '', description: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este proyecto y toda su información asociada? Esta acción no se puede deshacer.')) return;
    await projectsApi.remove(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Proyectos</h1>
        <Can module="proyectos" action="create">
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Nuevo proyecto'}</Button>
        </Can>
      </div>

      {showForm && (
        <Card title="Crear proyecto manual">
          <form onSubmit={handleCreate} className="grid grid-cols-3 gap-3 items-end">
            <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Cliente" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            <Input label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Button type="submit">Guardar</Button>
          </form>
          <ErrorText>{error}</ErrorText>
        </Card>
      )}

      <Card>
        <Table columns={['Nombre', 'Cliente', 'Estado', 'Origen', 'Usuarios', '']}>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">
                <Link to={`/projects/${p.id}/contractual`} className="text-blue-600 hover:underline font-medium">{p.name}</Link>
              </td>
              <td className="py-2 pr-3">{p.client || '-'}</td>
              <td className="py-2 pr-3"><Badge color={p.status === 'activo' ? 'green' : 'gray'}>{p.status}</Badge></td>
              <td className="py-2 pr-3">{p.origin === 'cotizacion' ? 'Cotización' : 'Manual'}</td>
              <td className="py-2 pr-3">{p.Users?.length || 0}</td>
              <td className="py-2 pr-3 text-right">
                <Can module="proyectos" action="delete">
                  <Button variant="danger" onClick={() => handleDelete(p.id)}>Eliminar</Button>
                </Can>
              </td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-gray-400">Sin proyectos aún.</td></tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
