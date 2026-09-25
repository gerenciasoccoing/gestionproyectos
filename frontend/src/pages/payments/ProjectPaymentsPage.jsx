import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { projectPaymentsApi, withholdingTypesApi } from '../../api';
import { Card, Button, Select, Table, Badge, ErrorText, extractError, money, formatDate, formatDateTime } from '../../components/ui';
import { fileUrl } from '../../api/client';

// "Pagos al proyecto": lee exclusivamente los ingresos de caja ya registrados en Cajas (ver
// CashBoxesPage.jsx) — no hay formulario acá, es una vista consolidada de solo lectura sobre la
// misma fuente de verdad (ver projectPaymentsService.js en el backend), para no duplicar
// información ni lógica.
export default function ProjectPaymentsPage() {
  const { t } = useTranslation();
  const { project, projectId } = useOutletContext();
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [withholdingTypes, setWithholdingTypes] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', withholdingTypeId: '' });
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const loadSummary = () => projectPaymentsApi.summary(projectId).then(setSummary).catch((err) => setError(extractError(err)));
  const loadPayments = () => {
    const params = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.withholdingTypeId) params.withholdingTypeId = filters.withholdingTypeId;
    projectPaymentsApi.list(projectId, params).then(setPayments).catch((err) => setError(extractError(err)));
  };

  useEffect(() => { loadSummary(); }, [projectId]);
  useEffect(() => { loadPayments(); }, [projectId, filters]);
  useEffect(() => { withholdingTypesApi.list().then(setWithholdingTypes); }, []);

  const download = async (format) => {
    setExporting(format);
    setError('');
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.withholdingTypeId) params.withholdingTypeId = filters.withholdingTypeId;
      if (format === 'pdf') await projectPaymentsApi.exportPdf(projectId, params);
      else await projectPaymentsApi.exportExcel(projectId, params);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setExporting('');
    }
  };

  if (!summary) return <p className="text-gray-500">{t('common.loading')}</p>;

  const percentPaid = Math.max(0, Math.min(100, summary.percentPaid));

  return (
    <div>
      {project?.status === 'terminado' && (project.closeObservation || project.closeRealBalance != null) && (
        <Card title={t('payments.closeCard.title')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div><span className="text-gray-500">{t('payments.closeCard.realBalance')}:</span> <span className="font-medium">{money(project.closeRealBalance)}</span></div>
            <div><span className="text-gray-500">{t('payments.closeCard.closedBy')}:</span> {project.closedByUser?.name || '-'}</div>
            <div><span className="text-gray-500">{t('payments.closeCard.closedAt')}:</span> {formatDateTime(project.closedAt)}</div>
          </div>
          {project.closeObservation && (
            <p className="text-sm text-gray-700 mt-2"><span className="text-gray-500">{t('payments.closeCard.observation')}:</span> {project.closeObservation}</p>
          )}
        </Card>
      )}

      <Card title={t('payments.summary.title')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm mb-4">
          {summary.contractValue !== undefined && (
            <div><span className="text-gray-500">{t('payments.summary.contractValue')}:</span> <span className="font-medium">{money(summary.contractValue)}</span></div>
          )}
          <div><span className="text-gray-500">{t('payments.summary.executedValue')}:</span> <span className="font-medium">{money(summary.executedValue)}</span></div>
          <div><span className="text-gray-500">{t('payments.summary.totalGross')}:</span> <span className="font-medium">{money(summary.totalGross)}</span></div>
          <div><span className="text-gray-500">{t('payments.summary.totalWithholdings')}:</span> <span className="font-medium">{money(summary.totalWithholdings)}</span></div>
          <div><span className="text-gray-500">{t('payments.summary.totalNet')}:</span> <span className="font-medium">{money(summary.totalNet)}</span></div>
          <div><span className="text-gray-500">{t('payments.summary.recoverablePending')}:</span> <span className="font-medium">{money(summary.recoverablePending)}</span></div>
          <div><span className="text-gray-500">{t('payments.summary.saldoReal')}:</span> <span className={`font-semibold ${summary.saldoReal > 0 ? 'text-yellow-700' : 'text-green-700'}`}>{money(summary.saldoReal)}</span></div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{t('payments.summary.percentPaid')}</span>
            <span>{percentPaid}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percentPaid}%` }} />
          </div>
        </div>

        {summary.withholdingsByType.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">{t('payments.summary.withholdingsByType')}</p>
            <ul className="text-sm text-gray-600 space-y-0.5">
              {summary.withholdingsByType.map((w) => (
                <li key={w.typeName} className="flex justify-between max-w-sm">
                  <span>{w.typeName}</span>
                  <span className="font-medium">{money(w.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title={t('payments.list.title')} actions={
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!!exporting} onClick={() => download('pdf')}>
            {exporting === 'pdf' ? t('common.loading') : t('common.downloadPdf')}
          </Button>
          <Button variant="secondary" disabled={!!exporting} onClick={() => download('excel')}>
            {exporting === 'excel' ? t('common.loading') : t('common.downloadExcel')}
          </Button>
        </div>
      }>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('payments.list.from')}</label>
            <input type="date" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t('payments.list.to')}</label>
            <input type="date" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
          <Select label={t('payments.list.withholdingType')} value={filters.withholdingTypeId} onChange={(e) => setFilters({ ...filters, withholdingTypeId: e.target.value })}>
            <option value="">{t('payments.list.allTypes')}</option>
            {withholdingTypes.map((wt) => <option key={wt.id} value={wt.id}>{wt.name}</option>)}
          </Select>
        </div>
        <ErrorText>{error}</ErrorText>

        <Table columns={[t('payments.list.date'), t('payments.list.concept'), t('payments.list.gross'), t('payments.list.withholdings'), t('payments.list.net'), t('payments.list.cashBox'), t('payments.list.user'), t('payments.list.support'), '']}>
          {payments.map((p) => (
            <Fragment key={p.id}>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3">{formatDate(p.date)}</td>
                <td className="py-1 pr-3">{p.concept}{p.isWithholdingReturn && <Badge color="blue">{t('payments.list.returnBadge')}</Badge>}</td>
                <td className="py-1 pr-3">{money(p.grossAmount ?? p.amount)}</td>
                <td className="py-1 pr-3">{money((p.grossAmount ?? p.amount) - p.amount)}</td>
                <td className="py-1 pr-3 font-medium">{money(p.amount)}</td>
                <td className="py-1 pr-3">{p.CashBox?.name || '-'}</td>
                <td className="py-1 pr-3">{p.User?.name || '-'}</td>
                <td className="py-1 pr-3">{p.supportFilePath ? <a href={fileUrl(p.supportFilePath)} target="_blank" rel="noreferrer">📎</a> : '-'}</td>
                <td className="py-1 pr-3 text-right">
                  {p.withholdings?.length > 0 && (
                    <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                      {expandedId === p.id ? t('payments.list.hideDetail') : t('payments.list.viewDetail')}
                    </button>
                  )}
                </td>
              </tr>
              {expandedId === p.id && p.withholdings?.length > 0 && (
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={9} className="py-2 px-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="pr-2 py-1">{t('payments.list.withholdingType')}</th>
                          <th className="pr-2 py-1">{t('payments.list.base')}</th>
                          <th className="pr-2 py-1">{t('payments.list.percent')}</th>
                          <th className="pr-2 py-1">{t('payments.list.value')}</th>
                          <th className="pr-2 py-1">{t('payments.list.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.withholdings.map((w) => (
                          <tr key={w.id}>
                            <td className="pr-2 py-1">{w.typeName}</td>
                            <td className="pr-2 py-1">{money(w.base)}</td>
                            <td className="pr-2 py-1">{Number(w.percent)}%</td>
                            <td className="pr-2 py-1">{money(w.value)}</td>
                            <td className="pr-2 py-1">{w.recoverable ? (w.returned ? t('payments.list.returned') : t('payments.list.pendingReturn')) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {payments.length === 0 && <tr><td colSpan={9} className="py-3 text-center text-gray-400">{t('payments.list.empty')}</td></tr>}
        </Table>
      </Card>
    </div>
  );
}
