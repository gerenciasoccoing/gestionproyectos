import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api';
import { Button, Input, ErrorText, extractError } from '../components/ui';
import Logo from '../components/Logo';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(t('auth.resetTooShort')); return; }
    if (password !== confirmPassword) { setError(t('auth.resetMismatch')); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Logo size={48} /></div>

        <div className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('auth.resetTitle')}</h1>
          <p className="text-sm text-gray-500 mb-6 text-center">{t('auth.resetSubtitle')}</p>

          {done ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
              {t('auth.resetDone')}
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                <Input label={t('auth.resetNewPassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
                <Input label={t('auth.resetConfirmPassword')} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <ErrorText>{error}</ErrorText>
              <Button type="submit" className="w-full mt-6 py-2.5 rounded-lg" disabled={loading}>
                {loading ? t('auth.resetSaving') : t('auth.resetSubmit')}
              </Button>
            </form>
          )}

          <p className="text-center text-sm mt-6">
            <Link to="/login" className="text-blue-600 hover:underline font-medium">{t('auth.backToLogin')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
