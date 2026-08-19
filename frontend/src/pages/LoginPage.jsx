import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Button, Input, ErrorText, extractError } from '../components/ui';
import Logo from '../components/Logo';

function BenefitIcon({ path }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[19px] h-[19px]">
      <path d={path} />
    </svg>
  );
}

const BENEFIT_ICON_PATHS = [
  'M7 3h8l4 4v14H7z M15 3v4h4 M9.5 12.5h6M9.5 16h6',
  'M4 19V5M4 19h16M8 19v-6M12.5 19V9M17 19v-9',
  'M3 7h13l3 4v7H3z M16 11V7 M7.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
];

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
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      {/* Panel de propuesta de valor */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-slate-950 text-white lg:flex-1 flex flex-col px-6 py-10 sm:px-10 sm:py-14 lg:px-16 lg:py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'linear-gradient(to bottom, black, transparent 90%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 90%)',
          }}
        />

        <div className="relative flex flex-col h-full max-w-xl mx-auto lg:mx-0">
          <Logo size={30} dark />

          <p className="mt-10 text-xs font-semibold tracking-[0.12em] uppercase text-sky-400">
            {t('auth.eyebrow')}
          </p>
          <h1 className="font-display font-extrabold text-[2.1rem] sm:text-4xl lg:text-[2.75rem] leading-[0.98] mt-3 text-balance max-w-[15ch]">
            {t('auth.heroHeadline')}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-blue-100/80 max-w-[46ch]">
            {t('auth.heroDek')}
          </p>

          <div className="mt-10 lg:mt-auto lg:pt-10 grid gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex gap-3.5 items-start">
                <span className="shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center bg-white/10 border border-white/15 text-sky-300">
                  <BenefitIcon path={BENEFIT_ICON_PATHS[n - 1]} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{t(`auth.benefit${n}Title`)}</h3>
                  <p className="text-[13.5px] leading-relaxed text-blue-100/70 max-w-[42ch] mt-0.5">{t(`auth.benefit${n}Desc`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="min-h-screen lg:min-h-0 lg:flex-1 flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-6 lg:hidden">
            <Logo size={44} />
          </div>

          <form onSubmit={handleSubmit} className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('auth.welcome')}</h2>
            <p className="text-sm text-gray-500 mb-6 text-center">{t('auth.subtitle')}</p>

            <div className="flex flex-col gap-4">
              <Input label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <Input label={t('auth.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            <div className="flex justify-end mt-2">
              <Link to="/forgot-password" className="text-xs font-semibold text-blue-600 hover:underline">
                {t('auth.forgotPasswordLink')}
              </Link>
            </div>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" className="w-full mt-5 py-2.5 rounded-lg" disabled={loading}>
              {loading ? t('auth.loggingIn') : t('auth.loginButton')}
            </Button>

            <div className="mt-6 pt-5 border-t border-gray-100 text-center text-sm text-gray-500">
              {t('auth.registerCompanyPrompt')}{' '}
              <Link to="/register-company" className="text-blue-600 hover:underline font-medium">
                {t('auth.registerCompanyLink')} →
              </Link>
            </div>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            {t('auth.tagline')} &middot; ERGY-PROJECT
          </p>
        </div>
      </div>
    </div>
  );
}
