import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { laborParamsApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError, money, formatDate } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const DEFAULT_SOLIDARITY_BRACKETS = JSON.stringify([
  { minSmlv: 4, maxSmlv: 16, percent: 1 },
  { minSmlv: 16, maxSmlv: 17, percent: 1.2 },
  { minSmlv: 17, maxSmlv: 18, percent: 1.4 },
  { minSmlv: 18, maxSmlv: 19, percent: 1.6 },
  { minSmlv: 19, maxSmlv: 20, percent: 1.8 },
  { minSmlv: 20, maxSmlv: null, percent: 2 },
], null, 2);

const DEFAULT_INCAPACIDAD_TRAMOS = JSON.stringify([
  { desde: 1, hasta: 2, percent: 66.67, pagador: 'empleador' },
  { desde: 3, hasta: 90, percent: 66.67, pagador: 'eps' },
  { desde: 91, hasta: 180, percent: 50, pagador: 'eps' },
], null, 2);

const initialForm = {
  effectiveDate: '', smlv: '', auxTransporte: '', cesantiasDivisor: 360,
  interesesCesantiasPercent: 12, primaDivisor: 360, vacacionesDivisor: 720,
  topeAuxTransporteSalarios: 2,
  horasMensuales: 210, horaExtraDiurnaPercent: 25, horaExtraNocturnaPercent: 75,
  recargoNocturnoPercent: 35, recargoDominicalPercent: 90, recargoNocturnoDominicalPercent: 125,
  horaExtraDiurnaDominicalPercent: 115, horaExtraNocturnaDominicalPercent: 165,
  horarioNocturnoInicio: '19:00', horarioNocturnoFin: '06:00',
  topeHorasExtraDiarias: 2, topeHorasExtraSemanales: 12,
  saludPercent: 4, pensionPercent: 4,
  solidarityFundBracketsJson: DEFAULT_SOLIDARITY_BRACKETS,
  incapacidadGeneralTramosJson: DEFAULT_INCAPACIDAD_TRAMOS,
  notes: '',
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
    const { solidarityFundBracketsJson, incapacidadGeneralTramosJson, ...rest } = form;
    let solidarityFundBrackets;
    let incapacidadGeneralTramos;
    try {
      solidarityFundBrackets = JSON.parse(solidarityFundBracketsJson);
      incapacidadGeneralTramos = JSON.parse(incapacidadGeneralTramosJson);
    } catch {
      setError(t('admin.laborParameters.invalidJson'));
      return;
    }
    try {
      await laborParamsApi.create({ ...rest, solidarityFundBrackets, incapacidadGeneralTramos });
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

          <h4 className="col-span-full font-medium text-sm text-gray-700 border-t pt-3 -mb-1">{t('admin.laborParameters.sections.overtime')}</h4>
          <Input label={t('admin.laborParameters.horasMensuales')} type="number" min="1" step="0.01" value={form.horasMensuales} onChange={(e) => setForm({ ...form, horasMensuales: e.target.value })} />
          <Input label={t('admin.laborParameters.horaExtraDiurnaPercent')} type="number" min="0" step="0.01" value={form.horaExtraDiurnaPercent} onChange={(e) => setForm({ ...form, horaExtraDiurnaPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.horaExtraNocturnaPercent')} type="number" min="0" step="0.01" value={form.horaExtraNocturnaPercent} onChange={(e) => setForm({ ...form, horaExtraNocturnaPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.recargoNocturnoPercent')} type="number" min="0" step="0.01" value={form.recargoNocturnoPercent} onChange={(e) => setForm({ ...form, recargoNocturnoPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.recargoDominicalPercent')} type="number" min="0" step="0.01" value={form.recargoDominicalPercent} onChange={(e) => setForm({ ...form, recargoDominicalPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.recargoNocturnoDominicalPercent')} type="number" min="0" step="0.01" value={form.recargoNocturnoDominicalPercent} onChange={(e) => setForm({ ...form, recargoNocturnoDominicalPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.horaExtraDiurnaDominicalPercent')} type="number" min="0" step="0.01" value={form.horaExtraDiurnaDominicalPercent} onChange={(e) => setForm({ ...form, horaExtraDiurnaDominicalPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.horaExtraNocturnaDominicalPercent')} type="number" min="0" step="0.01" value={form.horaExtraNocturnaDominicalPercent} onChange={(e) => setForm({ ...form, horaExtraNocturnaDominicalPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.horarioNocturnoInicio')} type="time" value={form.horarioNocturnoInicio} onChange={(e) => setForm({ ...form, horarioNocturnoInicio: e.target.value })} />
          <Input label={t('admin.laborParameters.horarioNocturnoFin')} type="time" value={form.horarioNocturnoFin} onChange={(e) => setForm({ ...form, horarioNocturnoFin: e.target.value })} />
          <Input label={t('admin.laborParameters.topeHorasExtraDiarias')} type="number" min="0" step="0.01" value={form.topeHorasExtraDiarias} onChange={(e) => setForm({ ...form, topeHorasExtraDiarias: e.target.value })} />
          <Input label={t('admin.laborParameters.topeHorasExtraSemanales')} type="number" min="0" step="0.01" value={form.topeHorasExtraSemanales} onChange={(e) => setForm({ ...form, topeHorasExtraSemanales: e.target.value })} />

          <h4 className="col-span-full font-medium text-sm text-gray-700 border-t pt-3 -mb-1">{t('admin.laborParameters.sections.deductions')}</h4>
          <Input label={t('admin.laborParameters.saludPercent')} type="number" min="0" step="0.001" value={form.saludPercent} onChange={(e) => setForm({ ...form, saludPercent: e.target.value })} />
          <Input label={t('admin.laborParameters.pensionPercent')} type="number" min="0" step="0.001" value={form.pensionPercent} onChange={(e) => setForm({ ...form, pensionPercent: e.target.value })} />
          <label className="flex flex-col gap-1 text-sm text-gray-600 col-span-full lg:col-span-2">
            <span>{t('admin.laborParameters.solidarityFundBrackets')}</span>
            <textarea
              className="border border-gray-300 rounded px-2 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
              rows={6}
              value={form.solidarityFundBracketsJson}
              onChange={(e) => setForm({ ...form, solidarityFundBracketsJson: e.target.value })}
            />
          </label>

          <h4 className="col-span-full font-medium text-sm text-gray-700 border-t pt-3 -mb-1">{t('admin.laborParameters.sections.leaves')}</h4>
          <label className="flex flex-col gap-1 text-sm text-gray-600 col-span-full lg:col-span-2">
            <span>{t('admin.laborParameters.incapacidadGeneralTramos')}</span>
            <textarea
              className="border border-gray-300 rounded px-2 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
              rows={6}
              value={form.incapacidadGeneralTramosJson}
              onChange={(e) => setForm({ ...form, incapacidadGeneralTramosJson: e.target.value })}
            />
          </label>

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
