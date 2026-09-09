import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { reportsApi } from '../../api';
import { fileUrl } from '../../api/client';
import { Card, Button, TextArea, Table, ErrorText, extractError, money, formatDate } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

// Vista previa editable del Informe para Cliente (ver reportEngineService.js#getClientReportDraft
// en el backend): SOLO los campos de texto libre (introducción, descripción de actas, descripción
// de cada avance) son editables acá — todo lo numérico (%, valores, cantidades, la curva S) se
// muestra de solo lectura, porque el backend lo vuelve a calcular desde cero al exportar y nunca
// lee cifras del body de la petición (ver applyClientReportOverrides). "Exportar a PDF" es la
// única forma de generar el informe: no existe un link directo como en el resto de informes.
export default function ClientReportPreviewPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [introduccionText, setIntroduccionText] = useState('');
  const [descripcionActasText, setDescripcionActasText] = useState('');
  const [avanceDescripciones, setAvanceDescripciones] = useState({});

  useEffect(() => {
    reportsApi.clientReportDraft(projectId).then((data) => {
      setDraft(data);
      setIntroduccionText(data.introduccionText);
      setDescripcionActasText(data.descripcionActasText);
      const initial = {};
      data.itemsAvance.forEach((item) => item.avances.forEach((av) => { initial[av.progressEntryId] = av.descripcionText; }));
      setAvanceDescripciones(initial);
    }).catch((err) => setError(extractError(err)));
  }, [projectId]);

  const [exportPdf, exporting] = useSubmitGuard(async () => {
    setError('');
    try {
      await reportsApi.exportClientReportPdf(projectId, { introduccionText, descripcionActasText, avanceDescripciones });
    } catch (err) {
      setError(extractError(err));
    }
  });

  // Mismas fórmulas que drawLineChart en pdfService.js (planeado/real % = planned/actualEV sobre
  // el valor total del contrato) — solo para que la vista previa se vea igual al PDF; el PDF nunca
  // lee esto, vuelve a calcularlo por su cuenta al exportar.
  const sCurveDisplay = useMemo(() => {
    if (!draft) return [];
    const bac = Number(draft.valorTotalContrato) || 1;
    return draft.sCurve.map((p) => ({
      month: p.month,
      planeadoPercent: Math.round((Number(p.planned) / bac) * 10000) / 100,
      realPercent: Math.round((Number(p.actualEV) / bac) * 10000) / 100,
      planeado: Number(p.planned),
      valorEjecutado: Number(p.actualEV),
      costoReal: Number(p.actualAC),
    }));
  }, [draft]);

  if (!draft) {
    return <div className="text-gray-500">{error ? <ErrorText>{error}</ErrorText> : t('common.loading')}</div>;
  }

  return (
    <div>
      <Card title={t('reports.clientPreview.title')} actions={
        <Button onClick={exportPdf} loading={exporting}>{t('reports.clientPreview.exportPdf')}</Button>
      }>
        <p className="text-sm text-gray-500">{t('reports.clientPreview.help')}</p>
        <ErrorText>{error}</ErrorText>
      </Card>

      <Card title={t('reports.clientPreview.sections.cover')}>
        <dl className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('reports.clientPreview.fields.object')} value={draft.portada.objeto || '-'} />
          <Field label={t('reports.clientPreview.fields.contractNumber')} value={draft.portada.contractNumber || '-'} />
          <Field label={t('reports.clientPreview.fields.contractor')} value={draft.company?.companyName || '-'} />
          <Field label={t('reports.clientPreview.fields.client')} value={draft.portada.cliente || '-'} />
        </dl>
      </Card>

      <Card title={t('reports.clientPreview.sections.introduction')}>
        <TextArea value={introduccionText} onChange={(e) => setIntroduccionText(e.target.value)} rows={4} className="w-full" />
      </Card>

      <Card title={t('reports.clientPreview.sections.description')}>
        <p className="text-sm text-gray-700 whitespace-pre-line">{draft.descripcion || '-'}</p>
        {draft.fotoPortadaPath && (
          <img src={fileUrl(draft.fotoPortadaPath)} alt="" className="mt-2 w-64 h-40 object-cover rounded border border-gray-200" />
        )}
      </Card>

      <Card title={t('reports.clientPreview.sections.location')}>
        {draft.locationMapImagePath
          ? <img src={fileUrl(draft.locationMapImagePath)} alt="" className="w-64 h-40 object-cover rounded border border-gray-200" />
          : <p className="text-sm text-gray-400">{t('reports.clientPreview.noMap')}</p>}
      </Card>

      <Card title={t('reports.clientPreview.sections.minutes')}>
        <TextArea value={descripcionActasText} onChange={(e) => setDescripcionActasText(e.target.value)} rows={3} className="w-full mb-3" />
        <ul className="text-sm text-gray-700 list-disc pl-5">
          {draft.actas.map((a) => <li key={a.id}>{a.tipo} — {formatDate(a.fecha)}</li>)}
        </ul>
        {draft.actas.length === 0 && <p className="text-sm text-gray-400">{t('reports.clientPreview.noMinutes')}</p>}
      </Card>

      <Card title={t('reports.clientPreview.sections.team')}>
        <Table columns={[
          t('reports.clientPreview.team.name'), t('reports.clientPreview.team.id'),
          t('reports.clientPreview.team.eps'), t('reports.clientPreview.team.pension'), t('reports.clientPreview.team.arl'),
        ]}>
          {draft.equipo.map((e) => (
            <tr key={e.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{e.nombre}</td>
              <td className="py-1 pr-3">{e.cedula}</td>
              <td className="py-1 pr-3">{e.eps}</td>
              <td className="py-1 pr-3">{e.fondoPension}</td>
              <td className="py-1 pr-3">{e.arl}</td>
            </tr>
          ))}
          {draft.equipo.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-gray-400">{t('reports.clientPreview.noTeam')}</td></tr>}
        </Table>
      </Card>

      <Card title={t('reports.clientPreview.sections.budget')}>
        <Table columns={[
          t('reports.clientPreview.budget.code'), t('reports.clientPreview.budget.description'), t('reports.clientPreview.budget.unit'),
          t('reports.clientPreview.budget.qty'), t('reports.clientPreview.budget.unitValue'), t('reports.clientPreview.budget.total'),
        ]}>
          {draft.items.map((it, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-1 pr-3 font-mono text-xs">{it.itemCode}</td>
              <td className="py-1 pr-3">{it.descripcion}</td>
              <td className="py-1 pr-3">{it.unidad}</td>
              <td className="py-1 pr-3">{it.cantidad}</td>
              <td className="py-1 pr-3">{money(it.valorUnitario)}</td>
              <td className="py-1 pr-3">{money(it.valorTotal)}</td>
            </tr>
          ))}
          {draft.items.length === 0 && <tr><td colSpan={6} className="py-2 text-center text-gray-400">{t('reports.noProgressItems')}</td></tr>}
        </Table>
        <p className="text-right font-semibold text-sm mt-2">{t('reports.clientPreview.budget.totalContract')}: {money(draft.valorTotalContrato)}</p>
      </Card>

      <Card title={t('reports.clientPreview.sections.itemProgress')}>
        {draft.itemsAvance.map((item) => (
          <div key={item.budgetItemId} className="border-b border-gray-100 py-3 last:border-b-0">
            <p className="font-medium text-sm text-gray-800">{item.descripcion}</p>
            <p className="text-xs text-gray-500 mb-2">
              {t('reports.clientPreview.itemProgress.physical')}: {item.porcentajeFisico}%
              {' · '}
              {t('reports.clientPreview.itemProgress.economic')}: {item.porcentajeEconomico}%
            </p>
            {item.avances.map((av) => (
              <div key={av.progressEntryId} className="mb-3 pl-2 border-l-2 border-gray-100">
                <p className="text-xs text-gray-500 mb-1">{formatDate(av.fecha)} — {av.cantidadEjecutada} {item.unidad}</p>
                {av.fotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-2 max-w-md">
                    {av.fotos.map((f, i) => (
                      <img key={i} src={fileUrl(f)} alt="" className="w-full aspect-square object-cover rounded border border-gray-200" />
                    ))}
                  </div>
                )}
                <TextArea
                  value={avanceDescripciones[av.progressEntryId] ?? ''}
                  onChange={(e) => setAvanceDescripciones((prev) => ({ ...prev, [av.progressEntryId]: e.target.value }))}
                  rows={2}
                  className="w-full"
                />
              </div>
            ))}
            {item.avances.length === 0 && <p className="text-xs text-gray-400">{t('reports.clientPreview.itemProgress.noEntries')}</p>}
          </div>
        ))}
        {draft.itemsAvance.length === 0 && <p className="text-sm text-gray-400">{t('reports.noProgressItems')}</p>}
      </Card>

      <Card title={t('reports.clientPreview.sections.summary')}>
        <p className="text-sm font-medium text-gray-700 mb-1">{t('reports.clientPreview.summary.physical')}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={sCurveDisplay}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v) => `${v}%`} width={50} />
            <Tooltip formatter={(v) => `${v}%`} />
            <Legend />
            <Line type="monotone" dataKey="planeadoPercent" name={t('reports.sCurveSeries.planned')} stroke="#93c5fd" strokeWidth={2} />
            <Line type="monotone" dataKey="realPercent" name={t('reports.clientPreview.summary.real')} stroke="#2563eb" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>

        <p className="text-sm font-medium text-gray-700 mb-1 mt-4">{t('reports.clientPreview.summary.economic')}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={sCurveDisplay}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v) => money(v)} width={90} />
            <Tooltip formatter={(v) => money(v)} />
            <Legend />
            <Line type="monotone" dataKey="planeado" name={t('reports.sCurveSeries.planned')} stroke="#93c5fd" strokeWidth={2} />
            <Line type="monotone" dataKey="valorEjecutado" name={t('reports.sCurveSeries.actualEv')} stroke="#2563eb" strokeWidth={2} />
            <Line type="monotone" dataKey="costoReal" name={t('reports.sCurveSeries.actualAc')} stroke="#f59e0b" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="flex justify-end mb-8">
        <Button onClick={exportPdf} loading={exporting}>{t('reports.clientPreview.exportPdf')}</Button>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}
