import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { scheduleApi } from '../../api';
import { Card, Button, ErrorText, extractError, formatDate } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

// Cronograma con IA: distribuye los ítems del presupuesto vigente en el tiempo disponible entre
// la fecha de inicio y fin del contrato (ver Contractual). La IA solo sugiere el orden
// constructivo y la duración relativa de cada ítem — las fechas de calendario las calcula
// siempre el backend, así que ningún ítem puede quedar fuera del rango del contrato (ver
// scheduleService.js). "Generar cronograma" reemplaza por completo cualquier cronograma anterior.
export default function SchedulePage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState('');

  const load = () => scheduleApi.get(projectId).then(setSchedule).catch((err) => setError(extractError(err)));
  useEffect(() => { load(); }, [projectId]);

  const [generate, generating] = useSubmitGuard(async () => {
    setError('');
    try {
      const result = await scheduleApi.generate(projectId);
      setSchedule(result);
    } catch (err) {
      setError(extractError(err));
    }
  });

  if (!schedule) return <div className="text-gray-500">{t('common.loading')}</div>;

  const rangeStart = new Date(schedule.timeframe.start).getTime();
  const rangeEnd = new Date(schedule.timeframe.end).getTime();
  const rangeMs = Math.max(1, rangeEnd - rangeStart);
  const offsetPercent = (dateStr) => ((new Date(dateStr).getTime() - rangeStart) / rangeMs) * 100;

  return (
    <div>
      <Card title={t('execution.schedule.title')} actions={
        <Can module="ejecucion" action="create">
          <Button onClick={generate} loading={generating}>
            {schedule.items.length ? t('execution.schedule.regenerate') : t('execution.schedule.generate')}
          </Button>
        </Can>
      }>
        <p className="text-sm text-gray-500 mb-3">{t('execution.schedule.help')}</p>
        <p className="text-sm text-gray-600 mb-4">
          {t('execution.schedule.range', { start: formatDate(schedule.timeframe.start), end: formatDate(schedule.timeframe.end) })}
        </p>
        <ErrorText>{error}</ErrorText>

        {schedule.items.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('execution.schedule.empty')}</p>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <a href={scheduleApi.exportPdfUrl(projectId)} target="_blank" rel="noreferrer">
                <Button variant="secondary">{t('common.downloadPdf')}</Button>
              </a>
              <a href={scheduleApi.exportExcelUrl(projectId)} target="_blank" rel="noreferrer">
                <Button variant="secondary">{t('common.downloadExcel')}</Button>
              </a>
            </div>

            <div className="flex justify-between text-xs text-gray-400 mb-1 pl-56">
              <span>{formatDate(schedule.timeframe.start)}</span>
              <span>{formatDate(schedule.timeframe.end)}</span>
            </div>
            <div className="space-y-2">
              {schedule.items.map((it) => {
                const left = offsetPercent(it.plannedStart);
                const width = Math.max(1, offsetPercent(it.plannedEnd) - left);
                return (
                  <div key={it.budgetItemId} className="flex items-center gap-2">
                    <div className="w-56 shrink-0 text-sm truncate" title={it.description}>
                      {it.sequenceOrder}. {it.description}
                    </div>
                    <div className="flex-1 relative h-5 bg-gray-100 rounded">
                      <div
                        className="absolute h-5 bg-blue-600 rounded"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${formatDate(it.plannedStart)} - ${formatDate(it.plannedEnd)}`}
                      />
                    </div>
                    <div className="w-40 shrink-0 text-xs text-gray-500 text-right">
                      {formatDate(it.plannedStart)} - {formatDate(it.plannedEnd)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
