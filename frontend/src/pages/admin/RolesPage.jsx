import { useEffect, useState } from 'react';
import { rolesApi } from '../../api';
import { Card, Button, Input, ErrorText, extractError } from '../../components/ui';

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState({ modules: [], actions: [] });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');

  const load = () => rolesApi.list().then(setRoles);
  useEffect(() => { load(); rolesApi.catalog().then(setCatalog); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await rolesApi.create(form);
      setForm({ name: '', description: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const togglePermission = async (role, moduleName, action) => {
    const key = `${moduleName}:${action}`;
    const has = role.permissions.some((p) => `${p.module}:${p.action}` === key);
    const permObj = role.permissions.find((p) => `${p.module}:${p.action}` === key);
    let nextIds;
    if (has) {
      nextIds = role.permissions.filter((p) => p.id !== permObj.id).map((p) => p.id);
    } else {
      // Necesitamos el id de permiso del catálogo global; lo buscamos a través de otro rol o admin ya cargado.
      const adminRole = roles.find((r) => r.name === 'admin');
      const found = adminRole?.permissions.find((p) => `${p.module}:${p.action}` === key);
      if (!found) return;
      nextIds = [...role.permissions.map((p) => p.id), found.id];
    }
    await rolesApi.update(role.id, { permissionIds: nextIds });
    load();
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este rol?')) return;
    await rolesApi.remove(id);
    load();
  };

  return (
    <Card title="Roles y Permisos" actions={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Nuevo rol'}</Button>}>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Input label="Nombre del rol" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button type="submit">Guardar</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      {roles.map((role) => (
        <div key={role.id} className="border border-gray-200 rounded p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">{role.name}</h4>
            {role.name !== 'admin' && <Button variant="danger" onClick={() => remove(role.id)}>Eliminar rol</Button>}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="pr-2 text-left">Módulo</th>
                  {catalog.actions.map((a) => <th key={a} className="px-2">{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {catalog.modules.map((m) => (
                  <tr key={m}>
                    <td className="pr-2 py-1">{m}</td>
                    {catalog.actions.map((a) => (
                      <td key={a} className="px-2 text-center">
                        <input
                          type="checkbox"
                          disabled={role.name === 'admin'}
                          checked={role.name === 'admin' || role.permissions.some((p) => p.module === m && p.action === a)}
                          onChange={() => togglePermission(role, m, a)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
  );
}
