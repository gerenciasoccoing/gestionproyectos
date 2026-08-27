import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { socialSecurityProvidersApi } from '../api';
import { Select, Input, Button, extractError } from './ui';
import useSubmitGuard from '../hooks/useSubmitGuard';

const ADD_NEW = '__add_new__';

// Selector de EPS/fondo de pensión/ARL con catálogo precargado (ver socialSecurityProviderController.js)
// y opción de crear una entidad nueva si no está en la lista. El valor sigue siendo texto plano
// (Employee.epsName/pensionFundName/arlName no cambian de tipo), así que un trabajador ya guardado
// con texto libre que no está en el catálogo se sigue mostrando tal cual.
export default function ProviderSelect({ type, label, value, onChange }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    socialSecurityProvidersApi.list(type).then(setOptions);
  }, [type]);

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === ADD_NEW) {
      setAdding(true);
      setNewName('');
      setError('');
    } else {
      onChange(v);
    }
  };

  const [submitNew, submitting] = useSubmitGuard(async () => {
    if (!newName.trim()) return;
    setError('');
    try {
      const created = await socialSecurityProvidersApi.create(type, newName.trim());
      setOptions((prev) => (prev.some((o) => o.name === created.name) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))));
      onChange(created.name);
      setAdding(false);
    } catch (err) {
      setError(extractError(err));
    }
  });

  const hasUnlistedValue = value && !options.some((o) => o.name === value);

  if (adding) {
    return (
      <div className="flex flex-col gap-1 text-sm text-gray-600">
        <span>{label}</span>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('personnel.detail.providerSelect.namePlaceholder')} />
          <Button type="button" onClick={submitNew} loading={submitting}>{t('common.save')}</Button>
          <Button type="button" variant="secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
        </div>
        {error && <span className="text-red-600 text-xs">{error}</span>}
      </div>
    );
  }

  return (
    <Select label={label} value={value || ''} onChange={handleSelect}>
      <option value="">-</option>
      {hasUnlistedValue && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
      <option value={ADD_NEW}>{t('personnel.detail.providerSelect.addNew')}</option>
    </Select>
  );
}
