import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffClient } from '../../api/client';
import { formatDate } from '../../utils/format';

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
};

export default function TenantsListPage() {
  const [tenants, setTenants] = useState([]);

  const load = () => staffClient.get('/super-admin/tenants').then((res) => setTenants(res.data));
  useEffect(() => { load(); }, []);

  const toggleStatus = async (tenant) => {
    const status = tenant.status === 'active' ? 'suspended' : 'active';
    await staffClient.patch(`/super-admin/tenants/${tenant.id}/status`, { status });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Tenants</h1>
        <Link to="/super-admin/nuevo" className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium">Nuevo tenant</Link>
      </div>
      <div className="bg-white rounded-xl shadow-sm divide-y">
        {tenants.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link to={`/super-admin/tenants/${t.id}`} className="font-medium text-gray-800 hover:underline">{t.name}</Link>
              <p className="text-sm text-gray-500">{t.subdomain} · {t.plan} · alta {formatDate(t.createdAt)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[t.status]}`}>{t.status === 'active' ? 'Activo' : 'Suspendido'}</span>
              <button type="button" onClick={() => toggleStatus(t)} className="text-sm text-indigo-600">
                {t.status === 'active' ? 'Suspender' : 'Reactivar'}
              </button>
            </div>
          </div>
        ))}
        {tenants.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">No hay tenants todavía.</p>}
      </div>
    </div>
  );
}
