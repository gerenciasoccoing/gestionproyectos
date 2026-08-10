import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rolesApi } from '../../api';
import { Card, Button, Input, ErrorText, extractError } from '../../components/ui';

export default function RolesPage() {
  const { t } = useTranslation();
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
    if (!confirm(t('admin.roles.confirmDelete'))) return;
    await rolesApi.remove(id);
    load();
  };

  const actionLabel = (a) => t(`common.${a}`, a);

  return (
    <Card title={t('admin.roles.title')} actions={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('admin.roles.new')}</Button>}>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Input label={t('admin.roles.roleName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('admin.roles.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button type="submit">{t('admin.roles.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      {roles.map((role) => (
        <div key={role.id} className="border border-gray-200 rounded p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">{role.name}</h4>
            {role.name !== 'admin' && <Button variant="danger" onClick={() => remove(role.id)}>{t('admin.roles.deleteRole')}</Button>}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="pr-2 text-left">{t('admin.roles.module')}</th>
                  {catalog.actions.map((a) => <th key={a} className="px-2">{actionLabel(a)}</th>)}
                </tr>
              </thead>
              <tbody>
                {catalog.modules.map((m) => (
                  <tr key={m}>
                    <td className="pr-2 py-1">{t(`admin.roles.modules.${m}`, m)}</td>
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
