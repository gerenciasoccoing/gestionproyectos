import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api';
import { Button, Input, ErrorText, extractError } from '../components/ui';
import Logo from '../components/Logo';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
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
          <h1 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('auth.forgotTitle')}</h1>
          <p className="text-sm text-gray-500 mb-6 text-center">{t('auth.forgotSubtitle')}</p>

          {sent ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
              {t('auth.forgotSent')}
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <Input label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <ErrorText>{error}</ErrorText>
              <Button type="submit" className="w-full mt-6 py-2.5 rounded-lg" disabled={loading}>
                {loading ? t('auth.forgotSending') : t('auth.forgotSubmit')}
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
