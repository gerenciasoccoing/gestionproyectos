import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { consortiumsApi } from '../api';
import { Select, Input, Button, extractError } from './ui';
import { useAuth } from '../context/AuthContext';

const ADD_NEW = '__add_new__';
const EMPTY_NEW = { name: '', nit: '', address: '', phone: '', legalRepName: '' };

// Selector de entidad contratante del proyecto: consorcio/unión temporal asignado, o vacío =
// empresa principal (el default). La opción "+ Crear nuevo consorcio" solo se muestra a quien
// tiene 'admin':'create' (mismo permiso que la gestión completa en Administración > Consorcios);
// el logo no se pide aquí para no complicar este formulario compacto — se agrega luego desde
// Administración si se necesita.
export default function ConsortiumSelect({ value, onChange }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [options, setOptions] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);
  const [error, setError] = useState('');

  useEffect(() => {
    consortiumsApi.list().then(setOptions);
  }, []);

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === ADD_NEW) {
      setAdding(true);
      setForm(EMPTY_NEW);
      setError('');
    } else {
      onChange(v);
    }
  };

  const submitNew = async () => {
    if (!form.name.trim()) return;
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      const created = await consortiumsApi.create(fd);
      setOptions((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id);
      setAdding(false);
    } catch (err) {
      setError(extractError(err));
    }
  };

  if (adding) {
    return (
      <div className="col-span-full flex flex-col gap-2 text-sm text-gray-600 border rounded p-3 bg-gray-50">
        <span className="font-medium">{t('projects.consortium.newTitle')}</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Input label={t('admin.consortiums.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('admin.consortiums.nit')} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
          <Input label={t('admin.consortiums.legalRepName')} value={form.legalRepName} onChange={(e) => setForm({ ...form, legalRepName: e.target.value })} />
          <Input label={t('admin.consortiums.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label={t('admin.consortiums.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <p className="text-xs text-gray-400">{t('projects.consortium.logoLaterNote')}</p>
        <div className="flex gap-2">
          <Button type="button" onClick={submitNew}>{t('common.save')}</Button>
          <Button type="button" variant="secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
        </div>
        {error && <span className="text-red-600 text-xs">{error}</span>}
      </div>
    );
  }

  return (
    <Select label={t('projects.consortium.label')} value={value || ''} onChange={handleSelect}>
      <option value="">{t('projects.consortium.mainCompany')}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      {can('admin', 'create') && <option value={ADD_NEW}>{t('projects.consortium.addNew')}</option>}
    </Select>
  );
}
