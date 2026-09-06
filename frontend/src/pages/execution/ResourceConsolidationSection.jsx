import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { budgetApi } from '../../api';
import { Card, Table } from '../../components/ui';

const SECTIONS = [
  { key: 'materials', labelKey: 'materials' },
  { key: 'labor', labelKey: 'labor' },
  { key: 'equipment', labelKey: 'equipment' },
  { key: 'transport', labelKey: 'transport' },
];

const ROW_BG = { warning: 'bg-yellow-50', exceeded: 'bg-red-50' };

function fmtQty(n) {
  return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

// Consolidado de recursos de todo el proyecto (solo aplica a ítems con APU): por cada ítem, toma
// su APU, multiplica la cantidad de cada recurso por la cantidad del ítem, y suma los recursos
// con el mismo nombre entre TODOS los ítems (ver resourceConsolidationService.js en el backend —
// siempre se recalcula en vivo, nunca queda en caché). Listo para exportar y enviar a un
// proveedor a cotizar. Las columnas "Comprado (OC)" y "% consumido" comparan cada recurso contra
// lo ya pedido en Órdenes de Compra del proyecto (por nombre) — mano de obra no tiene esa
// comparación porque Gastos solo registra valor, no jornales.
export default function ResourceConsolidationSection({ projectId, refreshKey }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    budgetApi.getResourceConsolidation(projectId).then(setData);
  }, [projectId, refreshKey]);

  if (!data) return null;
  const hasAny = SECTIONS.some(({ key }) => (data[key] || []).length > 0);
  if (!hasAny) return null;

  const alerts = SECTIONS.flatMap(({ key }) => (data[key] || []).filter((r) => r.status === 'warning' || r.status === 'exceeded'));

  return (
    <Card title={t('execution.budget.consolidation.title')} actions={
      <div className="flex gap-2">
        <a href={budgetApi.resourceConsolidationPdfUrl(projectId)} target="_blank" rel="noreferrer">
          <button type="button" className="px-3 py-1.5 text-sm rounded bg-gray-100 border border-gray-200 hover:bg-gray-200">{t('common.downloadPdf')}</button>
        </a>
        <a href={budgetApi.resourceConsolidationExcelUrl(projectId)} target="_blank" rel="noreferrer">
          <button type="button" className="px-3 py-1.5 text-sm rounded bg-gray-100 border border-gray-200 hover:bg-gray-200">{t('common.downloadExcel')}</button>
        </a>
      </div>
    }>
      <p className="text-sm text-gray-500 mb-3">{t('execution.budget.consolidation.help')}</p>
      {alerts.length > 0 && (
        <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
          {t('execution.budget.consolidation.alertSummary', { count: alerts.length })}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SECTIONS.map(({ key, labelKey }) => {
          const rows = data[key] || [];
          if (!rows.length) return null;
          const withPurchases = key !== 'labor';
          return (
            <div key={key}>
              <p className="text-sm font-semibold text-gray-700 mb-1">{t(`execution.budget.items.apuWizard.categories.${labelKey}`)}</p>
              <Table columns={[
                t('execution.budget.items.apuWizard.resourceName'),
                t('execution.budget.items.unit'),
                t('execution.budget.items.apuWizard.quantity'),
                ...(withPurchases ? [t('execution.budget.consolidation.purchased'), t('execution.budget.consolidation.percentConsumed')] : []),
              ]}>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${ROW_BG[r.status] || ''}`}>
                    <td className="py-1 pr-2">{r.name}</td>
                    <td className="py-1 pr-2">{r.unit}</td>
                    <td className="py-1 pr-2 text-right">{fmtQty(r.quantity)}</td>
                    {withPurchases && (
                      <>
                        <td className="py-1 pr-2 text-right">{fmtQty(r.purchasedQuantity)}</td>
                        <td className="py-1 pr-2 text-right">{r.percent === null ? '-' : `${fmtQty(r.percent)}%`}</td>
                      </>
                    )}
                  </tr>
                ))}
              </Table>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
