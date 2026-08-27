import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companyRegistrationApi } from '../api';
import { Button, Input, ErrorText, extractError } from '../components/ui';
import Logo from '../components/Logo';
import useSubmitGuard from '../hooks/useSubmitGuard';

const emptyForm = { companyName: '', nit: '', contactName: '', contactEmail: '', phone: '' };

export default function RegisterCompanyPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const [handleSubmit, loading] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await companyRegistrationApi.create(form);
      setSent(true);
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6"><Logo size={48} /></div>

        <div className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('companyRegistration.title')}</h1>
          <p className="text-sm text-gray-500 mb-6 text-center">{t('companyRegistration.subtitle')}</p>

          {sent ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
              {t('companyRegistration.success')}
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label={t('companyRegistration.companyName')} value={form.companyName} onChange={set('companyName')} required className="sm:col-span-2" />
                <Input label={t('companyRegistration.nit')} value={form.nit} onChange={set('nit')} />
                <Input label={t('companyRegistration.phone')} value={form.phone} onChange={set('phone')} />
                <Input label={t('companyRegistration.contactName')} value={form.contactName} onChange={set('contactName')} required className="sm:col-span-2" />
                <Input label={t('companyRegistration.contactEmail')} type="email" value={form.contactEmail} onChange={set('contactEmail')} required className="sm:col-span-2" />
              </div>
              <ErrorText>{error}</ErrorText>
              <Button type="submit" className="w-full mt-6 py-2.5 rounded-lg" loading={loading}>
                {loading ? t('companyRegistration.submitting') : t('companyRegistration.submit')}
              </Button>
            </form>
          )}

          <p className="text-center text-sm mt-6">
            <Link to="/login" className="text-blue-600 hover:underline font-medium">{t('companyRegistration.backToLogin')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
