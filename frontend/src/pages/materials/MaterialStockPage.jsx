import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { warehousesApi } from '../../api';
import { Card, Select, Table, formatDate } from '../../components/ui';

function money(n) {
  return `$ ${Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
}

// Existencias por bodega: una fila por material con su cantidad disponible, expandible al detalle
// por lote (OC de origen, proveedor, fecha de ingreso, cantidad disponible y costo unitario exacto
// de esa OC) — ver warehouseController.js#get/warehouseService.js#getWarehouseStock. Siempre en
// vivo, nunca una copia cacheada: la suma de los lotes es la existencia, por diseño no puede
// desincronizarse.
export default function MaterialStockPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [detail, setDetail] = useState(null);
  const [expandedMaterial, setExpandedMaterial] = useState(null);

  useEffect(() => {
    warehousesApi.list().then((list) => {
      setWarehouses(list);
      if (list.length) setWarehouseId((prev) => prev || list.find((w) => w.isDefault)?.id || list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    warehousesApi.get(warehouseId).then(setDetail);
  }, [warehouseId]);

  return (
    <Card title={t('materialsInventory.stock.title')}>
      <div className="mb-4 max-w-xs">
        <Select label={t('materialsInventory.warehouses.title')} value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setExpandedMaterial(null); }}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </div>

      {detail && (
        <Table columns={[t('materialsInventory.catalog.name'), t('materialsInventory.catalog.unit'), t('materialsInventory.stock.available'), '']}>
          {detail.stock.map((s) => (
            <Fragment key={s.materialId}>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3">{s.materialName}</td>
                <td className="py-1 pr-3">{s.unit || '-'}</td>
                <td className="py-1 pr-3 font-medium">{s.totalAvailable}</td>
                <td className="py-1 pr-3 text-right">
                  <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedMaterial(expandedMaterial === s.materialId ? null : s.materialId)}>
                    {expandedMaterial === s.materialId ? t('materialsInventory.stock.hideLots') : t('materialsInventory.stock.viewLots')}
                  </button>
                </td>
              </tr>
              {expandedMaterial === s.materialId && (
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={4} className="py-2 px-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="pr-2 py-1">{t('materialsInventory.stock.purchaseOrder')}</th>
                          <th className="pr-2 py-1">{t('materialsInventory.stock.supplier')}</th>
                          <th className="pr-2 py-1">{t('materialsInventory.stock.receivedDate')}</th>
                          <th className="pr-2 py-1">{t('materialsInventory.stock.available')}</th>
                          <th className="pr-2 py-1">{t('materialsInventory.stock.unitCost')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.lots.map((lot) => (
                          <tr key={lot.id}>
                            <td className="pr-2 py-1">{lot.purchaseOrderNumber ? `OC-${lot.purchaseOrderNumber}` : (lot.sourceType === 'devolucion' ? t('materialsInventory.stock.returnOrigin') : '-')}</td>
                            <td className="pr-2 py-1">{lot.supplierName || '-'}</td>
                            <td className="pr-2 py-1">{formatDate(lot.receivedDate)}</td>
                            <td className="pr-2 py-1">{lot.quantityAvailable}</td>
                            <td className="pr-2 py-1">{money(lot.unitCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {detail.stock.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">{t('materialsInventory.stock.empty')}</td></tr>}
        </Table>
      )}
    </Card>
  );
}
