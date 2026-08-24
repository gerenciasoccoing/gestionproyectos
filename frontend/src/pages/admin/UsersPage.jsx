import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi, rolesApi, projectsApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError } from '../../components/ui';

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', roleIds: [] });
  const [error, setError] = useState('');

  const load = () => usersApi.list().then(setUsers);
  useEffect(() => {
    load();
    rolesApi.list().then(setRoles);
    projectsApi.list().then(setProjects);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    // El backend ya rechaza un alta sin roles (userController.js), pero se valida acá también para
    // no hacer el viaje al servidor solo para enterarse de eso.
    if (!form.roleIds.length) { setError(t('admin.users.roleRequired')); return; }
    try {
      await usersApi.create(form);
      setForm({ name: '', email: '', password: '', roleIds: [] });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const toggleRole = (roleId) => setForm((f) => ({
    ...f,
    roleIds: f.roleIds.includes(roleId) ? f.roleIds.filter((r) => r !== roleId) : [...f.roleIds, roleId],
  }));

  const toggleActive = async (user) => {
    await usersApi.update(user.id, { active: !user.active });
    load();
  };

  const assignProject = async (user, projectId, checked) => {
    const current = user.projects.map((p) => p.id);
    const next = checked ? [...current, projectId] : current.filter((id) => id !== projectId);
    await usersApi.assignProjects(user.id, next);
    load();
  };

  // Reasigna los roles de un usuario ya creado (ver admin.users.roles en la tabla). El backend
  // rechaza dejar al usuario sin ningún rol (mismo chequeo que en el alta, ver userController.js)
  // así que ese error puede llegar acá si se destildan todos.
  const updateUserRoles = async (user, roleId, checked) => {
    const current = user.roles.map((r) => r.id);
    const next = checked ? [...current, roleId] : current.filter((id) => id !== roleId);
    setError('');
    try {
      await usersApi.update(user.id, { roleIds: next });
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('admin.users.title')} actions={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('admin.users.new')}</Button>}>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Input label={t('admin.users.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('admin.users.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label={t('admin.users.password')} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <div className="col-span-full">
            <p className="text-sm text-gray-600 mb-1">{t('admin.users.roles')}</p>
            <div className="flex gap-3 flex-wrap">
              {roles.map((r) => (
                <label key={r.id} className="text-sm flex items-center gap-1">
                  <input type="checkbox" checked={form.roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="col-span-full">{t('admin.users.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      {!showForm && <ErrorText>{error}</ErrorText>}
      <Table columns={[t('admin.users.table.name'), t('admin.users.table.email'), t('admin.users.table.roles'), t('admin.users.table.projects'), t('admin.users.table.active')]}>
        {users.map((u) => (
          <tr key={u.id} className="border-b border-gray-100 align-top">
            <td className="py-2 pr-3">{u.name}</td>
            <td className="py-2 pr-3">{u.email}</td>
            <td className="py-2 pr-3">
              <div className="flex flex-col gap-1">
                {roles.map((r) => (
                  <label key={r.id} className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={u.roles.some((ur) => ur.id === r.id)}
                      onChange={(e) => updateUserRoles(u, r.id, e.target.checked)}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </td>
            <td className="py-2 pr-3">
              <div className="flex flex-col gap-1">
                {projects.map((p) => (
                  <label key={p.id} className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={u.projects.some((up) => up.id === p.id)} onChange={(e) => assignProject(u, p.id, e.target.checked)} />
                    {p.name}
                  </label>
                ))}
              </div>
            </td>
            <td className="py-2 pr-3">
              <Button variant={u.active ? 'secondary' : 'primary'} onClick={() => toggleActive(u)}>
                {u.active ? t('admin.users.deactivate') : t('admin.users.activate')}
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
