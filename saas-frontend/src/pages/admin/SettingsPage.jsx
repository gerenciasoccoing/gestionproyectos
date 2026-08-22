import { useEffect, useState } from 'react';
import { staffClient } from '../../api/client';
import { useStaffAuth } from '../../context/StaffAuthContext';

export default function SettingsPage() {
  const { staffUser } = useStaffAuth();
  const [settings, setSettings] = useState(null);
  const [brandForm, setBrandForm] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    wompiPublicKey: '', wompiPrivateKey: '', wompiEventsSecret: '', wompiIntegritySecret: '', wompiSandbox: true,
  });
  const [logoFile, setLogoFile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => staffClient.get('/tenant/settings').then((res) => {
    setSettings(res.data);
    setBrandForm({
      name: res.data.name,
      colorPrimary: res.data.colorPrimary,
      colorSecondary: res.data.colorSecondary,
      shippingType: res.data.shippingType,
      shippingFixedRate: res.data.shippingFixedRate,
    });
    setPaymentForm((f) => ({ ...f, wompiPublicKey: res.data.wompiPublicKey || '', wompiSandbox: res.data.wompiSandbox }));
  });

  useEffect(() => { load(); }, []);

  if (staffUser?.role !== 'tenant_admin') {
    return <p className="text-gray-500">Solo un administrador de la tienda puede ver esta sección.</p>;
  }
  if (!settings || !brandForm) return <p className="text-gray-500">Cargando…</p>;

  const saveBranding = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      await staffClient.put('/tenant/settings/branding', brandForm);
      if (logoFile) {
        const data = new FormData();
        data.append('logo', logoFile);
        await staffClient.post('/tenant/settings/logo', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setMessage('Marca y envío actualizados.');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar');
    }
  };

  const savePayment = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      await staffClient.put('/tenant/settings/payment', paymentForm);
      setMessage('Credenciales de pago actualizadas.');
      setPaymentForm((f) => ({
        ...f, wompiPrivateKey: '', wompiEventsSecret: '', wompiIntegritySecret: '',
      }));
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar');
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-xl font-bold text-gray-900">Configuración de la tienda</h1>
      {message && <p className="text-green-600 text-sm">{message}</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      <form onSubmit={saveBranding} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <p className="font-semibold text-gray-800">Marca y envío</p>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="name">Nombre de la tienda</label>
          <input id="name" value={brandForm.name} onChange={(e) => setBrandForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="colorPrimary">Color primario</label>
            <input id="colorPrimary" type="color" value={brandForm.colorPrimary} onChange={(e) => setBrandForm((f) => ({ ...f, colorPrimary: e.target.value }))} className="w-full h-10 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="colorSecondary">Color secundario</label>
            <input id="colorSecondary" type="color" value={brandForm.colorSecondary} onChange={(e) => setBrandForm((f) => ({ ...f, colorSecondary: e.target.value }))} className="w-full h-10 border border-gray-300 rounded-lg" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="logo">Logo</label>
          <input id="logo" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files[0])} className="text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1" htmlFor="shippingType">Tipo de envío</label>
            <select id="shippingType" value={brandForm.shippingType} onChange={(e) => setBrandForm((f) => ({ ...f, shippingType: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">
              <option value="fixed">Tarifa fija</option>
              <option value="free">Envío gratis</option>
            </select>
          </div>
          {brandForm.shippingType === 'fixed' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1" htmlFor="shippingFixedRate">Tarifa de envío</label>
              <input id="shippingFixedRate" type="number" min="0" value={brandForm.shippingFixedRate} onChange={(e) => setBrandForm((f) => ({ ...f, shippingFixedRate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          )}
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">Guardar marca y envío</button>
      </form>

      <form onSubmit={savePayment} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <p className="font-semibold text-gray-800">Pasarela de pago (Wompi)</p>
        <p className="text-xs text-gray-500">
          Las llaves privadas se guardan cifradas y no se muestran de nuevo. Deja los campos en blanco si no quieres cambiarlas.
          {settings.hasWompiPrivateKey && ' Ya hay una llave privada configurada.'}
        </p>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="wompiPublicKey">Llave pública</label>
          <input id="wompiPublicKey" value={paymentForm.wompiPublicKey} onChange={(e) => setPaymentForm((f) => ({ ...f, wompiPublicKey: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="wompiPrivateKey">Llave privada</label>
          <input id="wompiPrivateKey" type="password" value={paymentForm.wompiPrivateKey} onChange={(e) => setPaymentForm((f) => ({ ...f, wompiPrivateKey: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="wompiEventsSecret">Secreto de eventos (webhook)</label>
          <input id="wompiEventsSecret" type="password" value={paymentForm.wompiEventsSecret} onChange={(e) => setPaymentForm((f) => ({ ...f, wompiEventsSecret: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="wompiIntegritySecret">Secreto de integridad</label>
          <input id="wompiIntegritySecret" type="password" value={paymentForm.wompiIntegritySecret} onChange={(e) => setPaymentForm((f) => ({ ...f, wompiIntegritySecret: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={paymentForm.wompiSandbox} onChange={(e) => setPaymentForm((f) => ({ ...f, wompiSandbox: e.target.checked }))} />
          Modo pruebas (sandbox)
        </label>
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">Guardar credenciales</button>
      </form>
    </div>
  );
}
