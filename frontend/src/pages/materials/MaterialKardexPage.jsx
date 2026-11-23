import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  materialKardexApi, warehousesApi, materialsApi, projectsApi, supplierPurchaseOrdersApi,
  materialTransfersApi, materialIssuesApi, materialReturnsApi,
} from '../../api';
import { Card, Select, Input, Table, Badge, formatDate, money } from '../../components/ui';

const TYPE_LABELS = {
  entrada: 'entrada', traslado_salida: 'traslado_salida', traslado_entrada: 'traslado_entrada', salida: 'salida', devolucion: 'devolucion',
};
const DIRECTION_COLOR = { in: 'green', out: 'red' };

// Kardex: histórico unificado de movimientos del Inventario de Materiales (Fase 6) — pura lectura
// con filtros (ver materialKardexService.js#getEntries). Cada fila enlaza, cuando aplica, al PDF
// del movimiento que la originó (traslado/salida/devolución) — una entrada por recepción de OC no
// tiene PDF propio (su soporte es el recibo de la Orden de Compra, ya existente en Ejecución).
export default function MaterialKardexPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [projects, setProjects] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    warehouseId: '', materialId: '', projectId: '', purchaseOrderId: '', person: '', movementType: '', from: '', to: '',
  });

  useEffect(() => {
    warehousesApi.list().then(setWarehouses);
    materialsApi.list().then(setMaterials);
    projectsApi.list().then(setProjects);
    supplierPurchaseOrdersApi.list().then(setPurchaseOrders).catch(() => setPurchaseOrders([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    materialKardexApi.list(params).then(setEntries).finally(() => setLoading(false));
  }, [filters]);

  const pdfUrlFor = (entry) => {
    if (!entry.pdfType || !entry.pdfId) return null;
    if (entry.pdfType === 'traslado') return materialTransfersApi.pdfUrl(entry.pdfId);
    if (entry.pdfType === 'salida') return materialIssuesApi.pdfUrl(entry.pdfId);
    return materialReturnsApi.pdfUrl(entry.pdfId);
  };

  return (
    <Card title={t('materialsInventory.kardex.title')}>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <Select label={t('materialsInventory.warehouses.title')} value={filters.warehouseId} onChange={(e) => setFilters({ ...filters, warehouseId: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <Select label={t('materialsInventory.catalog.name')} value={filters.materialId} onChange={(e) => setFilters({ ...filters, materialId: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Select label={t('materialsInventory.kardex.contract')} value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.contractNumber ? `${p.contractNumber} – ` : ''}{p.name}</option>)}
        </Select>
        <Select label={t('materialsInventory.kardex.purchaseOrder')} value={filters.purchaseOrderId} onChange={(e) => setFilters({ ...filters, purchaseOrderId: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {purchaseOrders.map((po) => <option key={po.id} value={po.id}>OC-{po.orderNumber} — {po.supplier}</option>)}
        </Select>
        <Select label={t('materialsInventory.kardex.movementType')} value={filters.movementType} onChange={(e) => setFilters({ ...filters, movementType: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {Object.keys(TYPE_LABELS).map((tp) => <option key={tp} value={tp}>{t(`materialsInventory.kardex.type.${tp}`)}</option>)}
        </Select>
        <Input label={t('materialsInventory.kardex.person')} value={filters.person} onChange={(e) => setFilters({ ...filters, person: e.target.value })} />
        <Input label={t('materialsInventory.kardex.from')} type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <Input label={t('materialsInventory.kardex.to')} type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      </div>

      <Table columns={[
        t('materialsInventory.transfers.date'), t('materialsInventory.kardex.movementType'), t('materialsInventory.warehouses.title'),
        t('materialsInventory.catalog.name'), t('materialsInventory.kardex.quantity'), t('materialsInventory.stock.unitCost'),
        t('materialsInventory.kardex.purchaseOrder'), t('materialsInventory.kardex.person'), t('materialsInventory.kardex.user'), '',
      ]}>
        {entries.map((e, idx) => {
          const url = pdfUrlFor(e);
          return (
            <tr key={`${e.type}-${e.movementId}-${e.materialId}-${idx}`} className="border-b border-gray-100">
              <td className="py-1 pr-3 whitespace-nowrap">{formatDate(e.date)}</td>
              <td className="py-1 pr-3"><Badge color={DIRECTION_COLOR[e.direction]}>{t(`materialsInventory.kardex.type.${e.type}`)}</Badge></td>
              <td className="py-1 pr-3">{e.warehouseName || '-'}</td>
              <td className="py-1 pr-3">{e.materialName}</td>
              <td className="py-1 pr-3">{e.direction === 'out' ? '-' : '+'}{Number(e.quantity)} {e.unit || ''}</td>
              <td className="py-1 pr-3">{money(e.unitCost)}</td>
              <td className="py-1 pr-3">{e.purchaseOrderNumber ? `OC-${e.purchaseOrderNumber}` : '-'}</td>
              <td className="py-1 pr-3">{e.person || '-'}</td>
              <td className="py-1 pr-3">{e.userName || '-'}</td>
              <td className="py-1 pr-3 text-right">
                {url && <a className="text-blue-600 hover:underline text-xs" href={url} target="_blank" rel="noreferrer">{t('common.view')}</a>}
              </td>
            </tr>
          );
        })}
        {!loading && entries.length === 0 && <tr><td colSpan={10} className="py-3 text-center text-gray-400">{t('materialsInventory.kardex.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
