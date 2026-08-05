import { useEffect, useState } from 'react';
import { companyApi } from '../../api';
import { Card, Button, Input, ErrorText, extractError } from '../../components/ui';
import { fileUrl } from '../../api/client';

export default function CompanySettingsPage() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ companyName: '', nit: '', address: '', phone: '', defaultPrestacionalPercent: '70' });
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
      setOk(true);
    } catch (err) {
      setError(extractError(err));
    }
  };

  if (!settings) return null;

  return (
    <Card title="Datos de la Empresa (branding para PDF de cotización)">
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Nombre de la empresa" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
        <Input label="NIT" value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
        <Input label="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input
          label="Factor prestacional por defecto en APU (%)"
          type="number" min="0" step="0.01"
          value={form.defaultPrestacionalPercent}
          onChange={(e) => setForm({ ...form, defaultPrestacionalPercent: e.target.value })}
        />
        <div>
          <Input label="Logo" type="file" accept="image/*" onChange={(e) => setLogo(e.target.files[0])} />
          {settings.logoPath && <img src={fileUrl(settings.logoPath)} alt="logo" className="h-16 mt-2" />}
        </div>
        <Button type="submit" className="col-span-full w-fit">Guardar</Button>
        <div className="col-span-full">
          <ErrorText>{error}</ErrorText>
          {ok && <p className="text-sm text-green-600">Guardado correctamente.</p>}
        </div>
      </form>
    </Card>
  );
}
