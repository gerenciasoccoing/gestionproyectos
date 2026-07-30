import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Input, ErrorText, extractError } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Gestión de Proyectos</h1>
        <p className="text-sm text-gray-500 mb-6">Ingrese sus credenciales</p>
        <div className="flex flex-col gap-3">
          <Input label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full mt-4" disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>
    </div>
  );
}
