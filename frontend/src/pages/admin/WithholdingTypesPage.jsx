import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { withholdingTypesApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', defaultPercent: '', recoverable: false };

// Catálogo de tipos de retención (Administración > Parámetros > Retenciones), usado al registrar
// un pago a caja asociado a un proyecto (ver CashBoxesPage.jsx). No se elimina un tipo ya usado en
// un pago — solo se desactiva (setStatus), igual que Cajas.
export default function WithholdingTypesPage() {
  const { t } = useTranslation();
  const [types, setTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => withholdingTypesApi.list().then(setTypes);
  useEffect(() => { load(); }, []);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (type) => {
    setForm({ name: type.name, defaultPercent: String(type.defaultPercent), recoverable: type.recoverable });
    setEditingId(type.id);
    setShowForm(true);
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await withholdingTypesApi.update(editingId, form);
      else await withholdingTypesApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (type) => {
    await withholdingTypesApi.setStatus(type.id, !type.active);
    load();
  };

  return (
    <Card title={t('admin.withholdingTypes.title')} actions={
      <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
        {showForm ? t('common.cancel') : t('admin.withholdingTypes.newType')}
      </Button>
    }>
      <p className="text-sm text-gray-500 mb-3">{t('admin.withholdingTypes.help')}</p>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 items-end">
          <Input label={t('admin.withholdingTypes.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('admin.withholdingTypes.defaultPercent')} type="number" min="0" max="100" step="0.001" value={form.defaultPercent} onChange={(e) => setForm({ ...form, defaultPercent: e.target.value })} required />
          <label className="flex items-center gap-2 text-sm mb-2">
            <input type="checkbox" checked={form.recoverable} onChange={(e) => setForm({ ...form, recoverable: e.target.checked })} />
            {t('admin.withholdingTypes.recoverable')}
          </label>
          <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('admin.withholdingTypes.table.name'), t('admin.withholdingTypes.table.percent'), t('admin.withholdingTypes.table.recoverable'), t('admin.withholdingTypes.table.status'), '']}>
        {types.map((type) => (
          <tr key={type.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{type.name}</td>
            <td className="py-1 pr-3">{Number(type.defaultPercent)}%</td>
            <td className="py-1 pr-3">{type.recoverable ? <Badge color="blue">{t('common.yes')}</Badge> : '-'}</td>
            <td className="py-1 pr-3"><Badge color={type.active ? 'green' : 'gray'}>{t(type.active ? 'admin.withholdingTypes.active' : 'admin.withholdingTypes.inactive')}</Badge></td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(type)}>{t('common.edit')}</button>
              <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => toggleStatus(type)}>
                {type.active ? t('admin.withholdingTypes.deactivate') : t('admin.withholdingTypes.activate')}
              </button>
            </td>
          </tr>
        ))}
        {types.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('admin.withholdingTypes.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
