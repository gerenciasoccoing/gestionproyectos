import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { reportsApi, risksApi } from '../../api';
import { Card, Button, Input, Select, TextArea, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

export default function ReportsPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [evm, setEvm] = useState(null);
  const [sCurve, setSCurve] = useState([]);
  const [mm, setMm] = useState(null);
  const [progress, setProgress] = useState([]);

  useEffect(() => {
    reportsApi.evm(projectId).then(setEvm);
    reportsApi.sCurve(projectId).then(setSCurve);
    reportsApi.milestonesMinutes(projectId).then(setMm);
    reportsApi.progressByItem(projectId).then(setProgress);
  }, [projectId]);

  return (
    <div>
      <AiReportsSection projectId={projectId} projectStart={evm?.start} />

      <Card title={t('reports.evmTitle')} actions={
        <a href={reportsApi.exportPdfUrl(projectId)} target="_blank" rel="noreferrer">
          <Button variant="secondary">{t('reports.exportPdf')}</Button>
        </a>
      }>
        {evm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <Metric label={t('reports.metrics.pv')} value={money(evm.PV)} />
            <Metric label={t('reports.metrics.ev')} value={money(evm.EV)} />
            <Metric label={t('reports.metrics.ac')} value={money(evm.AC)} />
            <Metric label={t('reports.metrics.cv')} value={money(evm.CV)} negative={evm.CV < 0} />
            <Metric label={t('reports.metrics.sv')} value={money(evm.SV)} negative={evm.SV < 0} />
            <Metric label={t('reports.metrics.cpi')} value={evm.CPI !== null ? evm.CPI.toFixed(2) : t('reports.metrics.notAvailable')} negative={evm.CPI !== null && evm.CPI < 1} />
            <Metric label={t('reports.metrics.spi')} value={evm.SPI !== null ? evm.SPI.toFixed(2) : t('reports.metrics.notAvailable')} negative={evm.SPI !== null && evm.SPI < 1} />
          </div>
        )}
      </Card>

      <Card title={t('reports.sCurveTitle')}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={sCurve}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v) => money(v)} width={90} />
            <Tooltip formatter={(v) => money(v)} />
            <Legend />
            <Line type="monotone" dataKey="planned" name={t('reports.sCurveSeries.planned')} stroke="#93c5fd" strokeWidth={2} />
            <Line type="monotone" dataKey="actualEV" name={t('reports.sCurveSeries.actualEv')} stroke="#2563eb" strokeWidth={2} />
            <Line type="monotone" dataKey="actualAC" name={t('reports.sCurveSeries.actualAc')} stroke="#f59e0b" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {mm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title={t('reports.milestonesSummary')}>
            <Table columns={[t('reports.milestonesTable.milestone'), t('reports.milestonesTable.planned'), t('reports.milestonesTable.actual'), t('reports.milestonesTable.status')]}>
              {mm.milestones.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="py-1 pr-3">{m.name}</td>
                  <td className="py-1 pr-3">{formatDate(m.plannedDate)}</td>
                  <td className="py-1 pr-3">{formatDate(m.actualDate) || '-'}</td>
                  <td className="py-1 pr-3"><Badge color={m.status === 'cumplido' ? 'green' : m.status === 'atrasado' ? 'red' : 'yellow'}>{t(`execution.milestones.status.${m.status}`, m.status)}</Badge></td>
                </tr>
              ))}
              {mm.milestones.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-gray-400">{t('reports.noMilestones')}</td></tr>}
            </Table>
          </Card>
          <Card title={t('reports.minutesStatus')}>
            <Table columns={[t('reports.minutesTable.type'), t('reports.minutesTable.date')]}>
              {mm.minutes.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="py-1 pr-3"><Badge>{t(`execution.minutes.types.${m.type}`, m.type)}</Badge></td>
                  <td className="py-1 pr-3">{formatDate(m.date)}</td>
                </tr>
              ))}
              {mm.minutes.length === 0 && <tr><td colSpan={2} className="py-2 text-center text-gray-400">{t('reports.noMinutes')}</td></tr>}
            </Table>
          </Card>
        </div>
      )}

      <Card title={t('reports.progressTitle')}>
        {progress.map((it) => (
          <div key={it.id} className="border-b border-gray-100 py-2">
            <p className="text-sm"><strong>{it.description}</strong> — {it.accumulatedQty}/{Number(it.quantity)} {it.unit} ({it.percent}%)</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {it.photos?.map((p, i) => (
                <a key={i} href={fileUrl(p)} target="_blank" rel="noreferrer">
                  <img src={fileUrl(p)} alt="avance" className="w-14 h-14 object-cover rounded border" />
                </a>
              ))}
            </div>
          </div>
        ))}
        {progress.length === 0 && <p className="text-gray-400 text-sm">{t('reports.noProgressItems')}</p>}
      </Card>

      <RisksSection projectId={projectId} />
    </div>
  );
}

// Motor de Informes con IA (ver reportEngineService.js/pdfService.js en el backend): dos informes
// generados bajo demanda a partir de los datos ya cargados del proyecto — nunca cifras distintas a
// las que ya se ven en este mismo módulo/el Dashboard de Ejecución, la IA solo redacta el texto.
// El de Cliente siempre corta a hoy (sin selector); el Interno pide un rango, precargado con
// [inicio del proyecto (evm.start), hoy] igual que hace el backend por defecto si no se manda rango.
function AiReportsSection({ projectId, projectStart }) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);

  useEffect(() => {
    if (projectStart && !from) setFrom(String(projectStart).slice(0, 10));
  }, [projectStart]);

  return (
    <Card title={t('reports.aiReports.title')}>
      <p className="text-sm text-gray-500 mb-4">{t('reports.aiReports.subtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded p-3">
          <h4 className="font-medium text-sm text-gray-800 mb-1">{t('reports.aiReports.clientTitle')}</h4>
          <p className="text-xs text-gray-500 mb-3">{t('reports.aiReports.clientDescription')}</p>
          <a href={reportsApi.clientReportPdfUrl(projectId)} target="_blank" rel="noreferrer">
            <Button>{t('reports.aiReports.generate')}</Button>
          </a>
        </div>
        <div className="border border-gray-200 rounded p-3">
          <h4 className="font-medium text-sm text-gray-800 mb-1">{t('reports.aiReports.internalTitle')}</h4>
          <p className="text-xs text-gray-500 mb-3">{t('reports.aiReports.internalDescription')}</p>
          <div className="flex flex-wrap gap-2 items-end mb-3">
            <Input label={t('reports.aiReports.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label={t('reports.aiReports.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <a href={reportsApi.internalReportPdfUrl(projectId, from || undefined, to || undefined)} target="_blank" rel="noreferrer">
            <Button>{t('reports.aiReports.generate')}</Button>
          </a>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, negative }) {
  return (
    <div className="bg-gray-50 rounded p-3">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className={`text-lg font-bold ${negative ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}

function RisksSection({ projectId }) {
  const { t } = useTranslation();
  const [risks, setRisks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', impact: 'medio', probability: 'media' });
  const [error, setError] = useState('');

  const load = () => risksApi.list(projectId).then(setRisks);
  useEffect(() => { load(); }, [projectId]);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await risksApi.create(projectId, form);
      setForm({ description: '', impact: 'medio', probability: 'media' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const updateStatus = async (id, status) => {
    await risksApi.update(projectId, id, { status });
    load();
  };

  const remove = async (id) => {
    if (!confirm(t('reports.risks.confirmDelete'))) return;
    await risksApi.remove(projectId, id);
    load();
  };

  return (
    <Card title={t('reports.risks.title')} actions={
      <Can module="informes" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('reports.risks.add')}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <TextArea label={t('reports.risks.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="col-span-full" />
          <Select label={t('reports.risks.impact')} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>
            <option value="alto">{t('reports.risks.impactLevels.alto')}</option>
            <option value="medio">{t('reports.risks.impactLevels.medio')}</option>
            <option value="bajo">{t('reports.risks.impactLevels.bajo')}</option>
          </Select>
          <Select label={t('reports.risks.probability')} value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })}>
            <option value="alta">{t('reports.risks.probabilityLevels.alta')}</option>
            <option value="media">{t('reports.risks.probabilityLevels.media')}</option>
            <option value="baja">{t('reports.risks.probabilityLevels.baja')}</option>
          </Select>
          <Button type="submit" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('reports.risks.table.description'), t('reports.risks.table.impact'), t('reports.risks.table.probability'), t('reports.risks.table.status'), '']}>
        {risks.map((r) => (
          <tr key={r.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{r.description}</td>
            <td className="py-1 pr-3"><Badge color={r.impact === 'alto' ? 'red' : r.impact === 'medio' ? 'yellow' : 'gray'}>{t(`reports.risks.impactLevels.${r.impact}`, r.impact)}</Badge></td>
            <td className="py-1 pr-3">{t(`reports.risks.probabilityLevels.${r.probability}`, r.probability)}</td>
            <td className="py-1 pr-3">
              <Can module="informes" action="edit" fallback={<Badge>{t(`reports.risks.status.${r.status}`, r.status)}</Badge>}>
                <Select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                  <option value="identificado">{t('reports.risks.status.identificado')}</option>
                  <option value="mitigado">{t('reports.risks.status.mitigado')}</option>
                  <option value="materializado">{t('reports.risks.status.materializado')}</option>
                  <option value="cerrado">{t('reports.risks.status.cerrado')}</option>
                </Select>
              </Can>
            </td>
            <td className="py-1 pr-3 text-right">
              <Can module="informes" action="delete"><Button variant="danger" onClick={() => remove(r.id)}>{t('common.delete')}</Button></Can>
            </td>
          </tr>
        ))}
        {risks.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-gray-400">{t('reports.risks.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
