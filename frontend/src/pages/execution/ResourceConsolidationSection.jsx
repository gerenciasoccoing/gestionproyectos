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

function fmtQty(n) {
  return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

// Consolidado de recursos de todo el proyecto (solo aplica a ítems con APU): por cada ítem, toma
// su APU, multiplica la cantidad de cada recurso por la cantidad del ítem, y suma los recursos
// con el mismo nombre entre TODOS los ítems (ver resourceConsolidationService.js en el backend —
// siempre se recalcula en vivo, nunca queda en caché). Listo para exportar y enviar a un
// proveedor a cotizar.
export default function ResourceConsolidationSection({ projectId, refreshKey }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    budgetApi.getResourceConsolidation(projectId).then(setData);
  }, [projectId, refreshKey]);

  if (!data) return null;
  const hasAny = SECTIONS.some(({ key }) => (data[key] || []).length > 0);
  if (!hasAny) return null;

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SECTIONS.map(({ key, labelKey }) => {
          const rows = data[key] || [];
          if (!rows.length) return null;
          return (
            <div key={key}>
              <p className="text-sm font-semibold text-gray-700 mb-1">{t(`execution.budget.items.apuWizard.categories.${labelKey}`)}</p>
              <Table columns={[t('execution.budget.items.apuWizard.resourceName'), t('execution.budget.items.unit'), t('execution.budget.items.apuWizard.quantity')]}>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 pr-2">{r.name}</td>
                    <td className="py-1 pr-2">{r.unit}</td>
                    <td className="py-1 pr-2 text-right">{fmtQty(r.quantity)}</td>
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
