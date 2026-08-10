import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { companyApi } from '../../api';
import { Card, Button, Input, Select, ErrorText, extractError, setCurrencyConfig } from '../../components/ui';
import { fileUrl } from '../../api/client';

export default function CompanySettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ companyName: '', nit: '', address: '', phone: '', defaultPrestacionalPercent: '70', currency: 'COP' });
  const [logo, setLogo] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    companyApi.get().then((s) => {
      setSettings(s);
      setForm({
        companyName: s.companyName,
        nit: s.nit || '',
        address: s.address || '',
        phone: s.phone || '',
        defaultPrestacionalPercent: String(s.defaultPrestacionalPercent ?? 70),
        currency: s.currency || 'COP',
      });
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setOk(false);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logo) fd.append('logo', logo);
      const updated = await companyApi.update(fd);
      setSettings(updated);
      setCurrencyConfig(updated.currency);
      setOk(true);
    } catch (err) {
      setError(extractError(err));
    }
  };

  if (!settings) return null;

  return (
    <Card title={t('admin.company.title')}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('admin.company.companyName')} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
        <Input label={t('admin.company.nit')} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
        <Input label={t('admin.company.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <Input label={t('admin.company.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input
          label={t('admin.company.prestacionalDefault')}
          type="number" min="0" step="0.01"
          value={form.defaultPrestacionalPercent}
          onChange={(e) => setForm({ ...form, defaultPrestacionalPercent: e.target.value })}
        />
        <Select label={t('admin.company.currency')} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="COP">{t('admin.company.currencyOptions.COP')}</option>
          <option value="USD">{t('admin.company.currencyOptions.USD')}</option>
          <option value="EUR">{t('admin.company.currencyOptions.EUR')}</option>
        </Select>
        <div>
          <Input label={t('admin.company.logo')} type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0])} />
          {settings.logoPath && <img src={fileUrl(settings.logoPath)} alt="logo" className="h-16 mt-2" />}
        </div>
        <Button type="submit" className="col-span-full w-fit">{t('admin.company.save')}</Button>
        <div className="col-span-full">
          <ErrorText>{error}</ErrorText>
          {ok && <p className="text-sm text-green-600">{t('admin.company.saved')}</p>}
        </div>
      </form>
    </Card>
  );
}
