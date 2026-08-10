import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Button, Input, ErrorText, extractError } from '../components/ui';
import Logo from '../components/Logo';

export default function LoginPage() {
  const { t } = useTranslation();
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size={48} />
        </div>

        <form onSubmit={handleSubmit} className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('auth.welcome')}</h1>
          <p className="text-sm text-gray-500 mb-6 text-center">{t('auth.subtitle')}</p>

          <div className="flex flex-col gap-4">
            <Input label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Input label={t('auth.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" className="w-full mt-6 py-2.5 rounded-lg" disabled={loading}>
            {loading ? t('auth.loggingIn') : t('auth.loginButton')}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t('auth.tagline')} &middot; ERGY-PROJECT
        </p>
      </div>
    </div>
  );
}
