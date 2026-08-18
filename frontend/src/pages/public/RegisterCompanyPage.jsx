import { useState } from 'react';
import { Link } from 'react-router-dom';
import { platformAdminApi } from '../../api';
import { Button, Input, ErrorText, extractError } from '../../components/ui';
import Logo from '../../components/Logo';

// Alta de una empresa cliente nueva (multi-tenant). Solo accesible por URL directa (no está
// enlazada desde la barra de navegación ni desde el login): mientras no existe un panel de
// super-admin con sesión propia (Entrega 3), la clave de operador cumple ese rol. La clave nunca
// se guarda en el navegador — se reenvía en cada intento desde el estado del formulario.
export default function RegisterCompanyPage() {
  const [form, setForm] = useState({
    secret: '', companyName: '', nit: '', address: '', phone: '', contactEmail: '',
    adminName: '', adminEmail: '', adminPassword: '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { secret, ...data } = form;
      const res = await platformAdminApi.createCompany(secret, data);
      setResult(res);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size={48} />
        </div>

        <div className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1 text-center">Registrar empresa nueva</h1>
          <p className="text-xs text-gray-500 mb-6 text-center">
            Crea una empresa (tenant) aislada, con su propio administrador. El catálogo de precios/APU
            queda vacío — se carga después con la importación de Excel.
          </p>

          {result ? (
            <div className="text-sm text-gray-700 flex flex-col gap-3">
              <p className="text-center text-green-700 bg-green-50 border border-green-200 rounded-lg py-3 px-4">
                Empresa "{result.company.companyName}" creada correctamente.
              </p>
              <p><span className="text-gray-500">Usuario administrador:</span> {result.admin.email}</p>
              <Link to="/login" className="text-blue-600 hover:underline text-center mt-2">Ir al login</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <Input label="Clave de operador" type="password" value={form.secret} onChange={set('secret')} required />
              <hr className="my-1" />
              <Input label="Nombre de la empresa" value={form.companyName} onChange={set('companyName')} required />
              <Input label="NIT" value={form.nit} onChange={set('nit')} />
              <Input label="Dirección" value={form.address} onChange={set('address')} />
              <Input label="Teléfono" value={form.phone} onChange={set('phone')} />
              <Input label="Correo de contacto" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
              <hr className="my-1" />
              <Input label="Nombre del administrador" value={form.adminName} onChange={set('adminName')} required />
              <Input label="Correo del administrador" type="email" value={form.adminEmail} onChange={set('adminEmail')} required />
              <Input label="Contraseña inicial" type="password" value={form.adminPassword} onChange={set('adminPassword')} required minLength={8} />

              {error && <ErrorText>{error}</ErrorText>}

              <Button type="submit" className="w-full py-2.5 rounded-lg mt-2" disabled={saving}>
                {saving ? 'Creando…' : 'Crear empresa'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">ERGY-PROJECT</p>
      </div>
    </div>
  );
}
