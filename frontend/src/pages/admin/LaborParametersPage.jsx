import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { laborParamsApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError, money, formatDate } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const initialForm = {
  effectiveDate: '', smlv: '', auxTransporte: '', cesantiasDivisor: 360,
  interesesCesantiasPercent: 12, primaDivisor: 360, vacacionesDivisor: 720,
  topeAuxTransporteSalarios: 2, notes: '',
};

export default function LaborParametersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const load = () => laborParamsApi.list().then(setParams);
  useEffect(() => { load(); }, []);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await laborParamsApi.create(form);
      setForm(initialForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('admin.laborParameters.title')} actions={
      <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('admin.laborParameters.newVersion')}</Button>
    }>
      <p className="text-sm text-gray-500 mb-3">
        {t('admin.laborParameters.help')}
      </p>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Input label={t('admin.laborParameters.effectiveDate')} type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required />
          <Input label={t('admin.laborParameters.smlv')} type="number" min="0" step="0.01" value={form.smlv} onChange={(e) => setForm({ ...form, smlv: e.target.value })} required />
          <Input label={t('admin.laborParameters.auxTransporte')} type="number" min="0" step="0.01" value={form.auxTransporte} onChange={(e) => setForm({ ...form, auxTransporte: e.target.value })} />
          <Input label={t('admin.laborParameters.topeAuxTransporte')} type="number" min="0" step="0.01" value={form.topeAuxTransporteSalarios} onChange={(e) => setForm({ ...form, topeAuxTransporteSalarios: e.target.value })} />
          <Input label={t('admin.laborParameters.cesantiasDivisor')} type="number" min="1" step="0.01" value={form.cesantiasDivisor} onChange={(e) => setForm({ ...form, cesantiasDivisor: e.target.value })} />
          <Input label={t('admin.laborParameters.interesesCesantiasPercent')} type="number" min="0" step="0.01" value={form.interesesCesantiasPercent} onChange={(e) => setForm({ ...form, interesesCesantiasPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.primaDivisor')} type="number" min="1" step="0.01" value={form.primaDivisor} onChange={(e) => setForm({ ...form, primaDivisor: e.target.value })} />
          <Input label={t('admin.laborParameters.vacacionesDivisor')} type="number" min="1" step="0.01" value={form.vacacionesDivisor} onChange={(e) => setForm({ ...form, vacacionesDivisor: e.target.value })} />
          <Input label={t('admin.laborParameters.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="col-span-full" />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('admin.laborParameters.saveVersion')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('admin.laborParameters.table.effectiveDate'), t('admin.laborParameters.table.smlv'), t('admin.laborParameters.table.auxTransporte'), t('admin.laborParameters.table.interesesPercent'), t('admin.laborParameters.table.notes')]}>
        {params.map((p) => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{formatDate(p.effectiveDate)}</td>
            <td className="py-1 pr-3">{money(p.smlv)}</td>
            <td className="py-1 pr-3">{money(p.auxTransporte)}</td>
            <td className="py-1 pr-3">{Number(p.interesesCesantiasPercent)}%</td>
            <td className="py-1 pr-3 text-xs text-gray-500">{p.notes}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
