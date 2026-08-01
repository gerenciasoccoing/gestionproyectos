import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { reportsApi, risksApi } from '../../api';
import { Card, Button, Input, Select, TextArea, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

export default function ReportsPage() {
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
      <Card title="Indicadores de Valor Ganado (EVM)" actions={
        <a href={reportsApi.exportPdfUrl(projectId)} target="_blank" rel="noreferrer">
          <Button variant="secondary">Exportar informe a PDF</Button>
        </a>
      }>
        {evm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <Metric label="PV (Planeado)" value={money(evm.PV)} />
            <Metric label="EV (Ganado)" value={money(evm.EV)} />
            <Metric label="AC (Costo real)" value={money(evm.AC)} />
            <Metric label="CV" value={money(evm.CV)} negative={evm.CV < 0} />
            <Metric label="SV" value={money(evm.SV)} negative={evm.SV < 0} />
            <Metric label="CPI" value={evm.CPI !== null ? evm.CPI.toFixed(2) : 'N/A'} negative={evm.CPI !== null && evm.CPI < 1} />
            <Metric label="SPI" value={evm.SPI !== null ? evm.SPI.toFixed(2) : 'N/A'} negative={evm.SPI !== null && evm.SPI < 1} />
          </div>
        )}
      </Card>

      <Card title="Curva S (Avance planeado vs. real)">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={sCurve}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v) => money(v)} width={90} />
            <Tooltip formatter={(v) => money(v)} />
            <Legend />
            <Line type="monotone" dataKey="planned" name="Planeado (PV)" stroke="#93c5fd" strokeWidth={2} />
            <Line type="monotone" dataKey="actualEV" name="Real - Ganado (EV)" stroke="#2563eb" strokeWidth={2} />
            <Line type="monotone" dataKey="actualAC" name="Real - Costo (AC)" stroke="#f59e0b" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {mm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Resumen de Hitos">
            <Table columns={['Hito', 'Planeado', 'Real', 'Estado']}>
              {mm.milestones.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="py-1 pr-3">{m.name}</td>
                  <td className="py-1 pr-3">{m.plannedDate}</td>
                  <td className="py-1 pr-3">{m.actualDate || '-'}</td>
                  <td className="py-1 pr-3"><Badge color={m.status === 'cumplido' ? 'green' : m.status === 'atrasado' ? 'red' : 'yellow'}>{m.status}</Badge></td>
                </tr>
              ))}
              {mm.milestones.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-gray-400">Sin hitos.</td></tr>}
            </Table>
          </Card>
          <Card title="Estado de Actas">
            <Table columns={['Tipo', 'Fecha']}>
              {mm.minutes.map((m) => (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="py-1 pr-3"><Badge>{m.type}</Badge></td>
                  <td className="py-1 pr-3">{m.date}</td>
                </tr>
              ))}
              {mm.minutes.length === 0 && <tr><td colSpan={2} className="py-2 text-center text-gray-400">Sin actas.</td></tr>}
            </Table>
          </Card>
        </div>
      )}

      <Card title="Avance por Ítem de Presupuesto (con galería de fotos)">
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
        {progress.length === 0 && <p className="text-gray-400 text-sm">Sin ítems de presupuesto.</p>}
      </Card>

      <RisksSection projectId={projectId} />
    </div>
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
  const [risks, setRisks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', impact: 'medio', probability: 'media' });
  const [error, setError] = useState('');

  const load = () => risksApi.list(projectId).then(setRisks);
  useEffect(() => { load(); }, [projectId]);

  const submit = async (e) => {
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
  };

  const updateStatus = async (id, status) => {
    await risksApi.update(projectId, id, { status });
    load();
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este riesgo?')) return;
    await risksApi.remove(projectId, id);
    load();
  };

  return (
    <Card title="Registro de Riesgos" actions={
      <Can module="informes" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar riesgo'}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <TextArea label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="col-span-full" />
          <Select label="Impacto" value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>
            <option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option>
          </Select>
          <Select label="Probabilidad" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })}>
            <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
          </Select>
          <Button type="submit">Guardar</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={['Descripción', 'Impacto', 'Probabilidad', 'Estado', '']}>
        {risks.map((r) => (
          <tr key={r.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{r.description}</td>
            <td className="py-1 pr-3"><Badge color={r.impact === 'alto' ? 'red' : r.impact === 'medio' ? 'yellow' : 'gray'}>{r.impact}</Badge></td>
            <td className="py-1 pr-3">{r.probability}</td>
            <td className="py-1 pr-3">
              <Can module="informes" action="edit" fallback={<Badge>{r.status}</Badge>}>
                <Select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                  <option value="identificado">identificado</option>
                  <option value="mitigado">mitigado</option>
                  <option value="materializado">materializado</option>
                  <option value="cerrado">cerrado</option>
                </Select>
              </Can>
            </td>
            <td className="py-1 pr-3 text-right">
              <Can module="informes" action="delete"><Button variant="danger" onClick={() => remove(r.id)}>Eliminar</Button></Can>
            </td>
          </tr>
        ))}
        {risks.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-gray-400">Sin riesgos registrados.</td></tr>}
      </Table>
    </Card>
  );
}
