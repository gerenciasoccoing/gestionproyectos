import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { materialContractAnalysisApi } from '../../api';
import { Card, Table, Button, money } from '../../components/ui';

function pct(n) {
  return n == null ? 'N/A' : `${Number(n).toFixed(1)}%`;
}

// Análisis de material por contrato (Fase 7) — pestaña del proyecto, puramente informativa: NO
// escribe nada (ni gastos ni ningún otro registro), solo lee lo que ya dejaron las fases 2-5 (ver
// materialContractAnalysisService.js). Mismo patrón de pestaña que ReportsPage/ExpensesPage: lee
// projectId del Outlet context de ProjectLayout.jsx.
export default function ProjectMaterialAnalysisPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [analysis, setAnalysis] = useState(null);
  const [expandedMaterial, setExpandedMaterial] = useState(null);

  useEffect(() => {
    materialContractAnalysisApi.get(projectId).then(setAnalysis);
  }, [projectId]);

  if (!analysis) return <div className="text-gray-500">{t('common.loading')}</div>;

  const { materials, totals } = analysis;

  return (
    <Card
      title={t('materialsInventory.analysis.title')}
      actions={
        <div className="flex gap-2">
          <a href={materialContractAnalysisApi.pdfUrl(projectId)} target="_blank" rel="noreferrer">
            <Button variant="secondary">{t('common.downloadPdf')}</Button>
          </a>
          <a href={materialContractAnalysisApi.excelUrl(projectId)} target="_blank" rel="noreferrer">
            <Button variant="secondary">{t('common.downloadExcel')}</Button>
          </a>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="border rounded p-2">
          <p className="text-xs text-gray-500">{t('materialsInventory.analysis.netConsumption')}</p>
          <p className="text-lg font-semibold">{Number(totals.netConsumption).toLocaleString('es-CO')}</p>
        </div>
        <div className="border rounded p-2">
          <p className="text-xs text-gray-500">{t('materialsInventory.analysis.realCost')}</p>
          <p className="text-lg font-semibold">{money(totals.totalRealCost)}</p>
        </div>
        <div className="border rounded p-2">
          <p className="text-xs text-gray-500">{t('materialsInventory.analysis.soldValue')}</p>
          <p className="text-lg font-semibold">{money(totals.soldValue)}</p>
        </div>
        <div className="border rounded p-2">
          <p className="text-xs text-gray-500">{t('materialsInventory.analysis.margin')}</p>
          <p className={`text-lg font-semibold ${totals.marginAmount < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {money(totals.marginAmount)} ({pct(totals.marginPercent)})
          </p>
        </div>
      </div>
      {totals.unpricedCost > 0 && (
        <p className="text-xs text-amber-700 mb-3">
          {t('materialsInventory.analysis.unpricedWarning', { cost: money(totals.unpricedCost) })}
        </p>
      )}

      <Table columns={[
        t('materialsInventory.catalog.name'), t('materialsInventory.analysis.issued'), t('materialsInventory.analysis.returned'),
        t('materialsInventory.analysis.netConsumption'), t('materialsInventory.analysis.realCost'), t('materialsInventory.analysis.soldValue'),
        t('materialsInventory.analysis.margin'), '',
      ]}>
        {materials.map((m) => (
          <Fragment key={m.materialId}>
            <tr className="border-b border-gray-100">
              <td className="py-1 pr-3">{m.materialName}{m.unit ? ` (${m.unit})` : ''}</td>
              <td className="py-1 pr-3">{m.quantityIssued}</td>
              <td className="py-1 pr-3">{m.quantityReturned}</td>
              <td className="py-1 pr-3 font-medium">{m.netConsumption}</td>
              <td className="py-1 pr-3">{money(m.totalRealCost)}</td>
              <td className="py-1 pr-3">{m.soldValue > 0 ? money(m.soldValue) : '-'}</td>
              <td className="py-1 pr-3">
                {m.pricedQuantity > 0 || m.soldValue > 0 ? (
                  <span className={m.marginAmount < 0 ? 'text-red-600' : 'text-green-700'}>{money(m.marginAmount)} ({pct(m.marginPercent)})</span>
                ) : <span className="text-amber-700 text-xs">{t('materialsInventory.analysis.noSalePrice')}</span>}
              </td>
              <td className="py-1 pr-3 text-right">
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedMaterial(expandedMaterial === m.materialId ? null : m.materialId)}>
                  {expandedMaterial === m.materialId ? t('materialsInventory.stock.hideLots') : t('materialsInventory.analysis.byPurchaseOrder')}
                </button>
              </td>
            </tr>
            {expandedMaterial === m.materialId && (
              <tr className="border-b border-gray-100 bg-gray-50">
                <td colSpan={8} className="py-2 px-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="pr-2 py-1">{t('materialsInventory.kardex.purchaseOrder')}</th>
                        <th className="pr-2 py-1">{t('materialsInventory.analysis.netConsumption')}</th>
                        <th className="pr-2 py-1">{t('materialsInventory.analysis.realCost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.byPurchaseOrder.map((po) => (
                        <tr key={po.purchaseOrderId || 'sin-oc'}>
                          <td className="pr-2 py-1">{po.purchaseOrderNumber ? `OC-${po.purchaseOrderNumber}` : '-'}</td>
                          <td className="pr-2 py-1">{po.quantity}</td>
                          <td className="pr-2 py-1">{money(po.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {m.unpricedQuantity > 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      {t('materialsInventory.analysis.unpricedDetail', { quantity: m.unpricedQuantity, cost: money(m.unpricedCost) })}
                    </p>
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
        {materials.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-gray-400">{t('materialsInventory.analysis.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
