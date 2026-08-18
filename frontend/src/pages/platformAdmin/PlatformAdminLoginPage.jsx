import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformAdminApi } from '../../api';
import { Button, Input, ErrorText, extractError } from '../../components/ui';
import Logo from '../../components/Logo';

// Login del operador de la plataforma — sesión propia, independiente del login de usuarios de
// empresa (ver api/client.js#platformAdminClient). Solo accesible por URL directa.
export default function PlatformAdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await platformAdminApi.login(email, password);
      localStorage.setItem('platformAdminToken', res.token);
      navigate('/platform-admin');
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size={48} />
        </div>

        <div className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-6 text-center">Panel de operador</h1>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

            {error && <ErrorText>{error}</ErrorText>}

            <Button type="submit" className="w-full py-2.5 rounded-lg mt-2" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">ERGY-PROJECT</p>
      </div>
    </div>
  );
}
