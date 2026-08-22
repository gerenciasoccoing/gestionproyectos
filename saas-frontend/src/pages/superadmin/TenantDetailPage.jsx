import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { staffClient } from '../../api/client';

export default function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    staffClient.get(`/super-admin/tenants/${id}`).then((res) => setForm({
      name: res.data.name,
      nit: res.data.nit || '',
      plan: res.data.plan,
      customDomain: res.data.customDomain || '',
      status: res.data.status,
    }));
  }, [id]);

  if (!form) return <p className="text-gray-500">Cargando…</p>;

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      await staffClient.put(`/super-admin/tenants/${id}`, form);
      setMessage('Tenant actualizado.');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar');
    }
  };

  return (
    <div className="max-w-lg">
      <button type="button" onClick={() => navigate('/super-admin')} className="text-sm text-gray-500 mb-3">← Volver</button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Editar tenant</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <input name="name" value={form.name} onChange={handleChange} placeholder="Nombre comercial" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        <input name="nit" value={form.nit} onChange={handleChange} placeholder="NIT" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        <select name="plan" value={form.plan} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2">
          <option value="trial">Prueba</option>
          <option value="basic">Básico</option>
          <option value="pro">Pro</option>
        </select>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="customDomain">Dominio propio (CNAME)</label>
          <input id="customDomain" name="customDomain" value={form.customDomain} onChange={handleChange} placeholder="tienda.empresa.com" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <select name="status" value={form.status} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2">
          <option value="active">Activo</option>
          <option value="suspended">Suspendido</option>
        </select>
        {message && <p className="text-green-600 text-sm">{message}</p>}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" className="w-full py-2.5 rounded-lg bg-gray-900 text-white font-medium">Guardar</button>
      </form>
    </div>
  );
}
