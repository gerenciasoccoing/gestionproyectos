import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../../context/StaffAuthContext';

export default function SuperAdminLoginPage() {
  const { staffUser, login } = useStaffAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (staffUser?.role === 'super_admin') return <Navigate to="/super-admin" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login('/auth/login', email, password);
      navigate('/super-admin');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl p-6 w-full max-w-sm space-y-3">
        <h1 className="text-lg font-bold text-gray-900">Super-admin de la plataforma</h1>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="password">Contraseña</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full py-2.5 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-60">
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
