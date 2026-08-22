import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffClient } from '../../api/client';

const EMPTY_FORM = {
  name: '', nit: '', subdomain: '', plan: 'trial', adminName: '', adminEmail: '', adminPassword: '',
};

export default function NewTenantPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await staffClient.post('/super-admin/tenants', form);
      navigate('/super-admin');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear el tenant');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Nuevo tenant</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <p className="font-semibold text-gray-700 text-sm">Datos de la empresa</p>
        <input name="name" value={form.name} onChange={handleChange} placeholder="Nombre comercial" required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        <input name="nit" value={form.nit} onChange={handleChange} placeholder="NIT" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        <input name="subdomain" value={form.subdomain} onChange={handleChange} placeholder="Subdominio (ej. miempresa)" required pattern="[a-z0-9-]+" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        <select name="plan" value={form.plan} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2">
          <option value="trial">Prueba</option>
          <option value="basic">Básico</option>
          <option value="pro">Pro</option>
        </select>

        <p className="font-semibold text-gray-700 text-sm pt-2">Usuario administrador inicial</p>
        <input name="adminName" value={form.adminName} onChange={handleChange} placeholder="Nombre" required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        <input name="adminEmail" type="email" value={form.adminEmail} onChange={handleChange} placeholder="Email" required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        <input name="adminPassword" type="password" value={form.adminPassword} onChange={handleChange} placeholder="Contraseña inicial" required className="w-full border border-gray-300 rounded-lg px-3 py-2" />

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-60">
          {submitting ? 'Creando…' : 'Crear tenant'}
        </button>
      </form>
    </div>
  );
}
