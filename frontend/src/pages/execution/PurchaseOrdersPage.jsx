import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { purchaseOrdersApi, budgetApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';

const STATUS_COLORS = {
  abierta: 'yellow',
  parcial: 'blue',
  cerrada: 'green',
  cerrada_con_faltantes: 'red',
};

export default function PurchaseOrdersPage() {
  const { projectId } = useOutletContext();
  const [orders, setOrders] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ supplier: '', date: '', items: [{ name: '', unit: '', quantityOrdered: '', unitPrice: '', budgetItemId: '' }] });
  const [report, setReport] = useState(null);

  const load = () => purchaseOrdersApi.list(projectId).then(setOrders);
  useEffect(() => {
    load();
    budgetApi.get(projectId).then((d) => setBudgetItems(d.items));
  }, [projectId]);

  const updateItemRow = (idx, field, value) => {
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, items };
    });
  };
  const addRow = () => setForm((f) => ({ ...f, items: [...f.items, { name: '', unit: '', quantityOrdered: '', unitPrice: '', budgetItemId: '' }] }));
  const removeRow = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        supplier: form.supplier,
        date: form.date,
        items: form.items.map((it) => ({ ...it, budgetItemId: it.budgetItemId || undefined })),
      };
      await purchaseOrdersApi.create(projectId, payload);
      setForm({ supplier: '', date: '', items: [{ name: '', unit: '', quantityOrdered: '', unitPrice: '', budgetItemId: '' }] });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const loadReport = async () => setReport(await purchaseOrdersApi.report(projectId, {}));

  return (
    <div>
      <Card title="Órdenes de Compra" actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadReport}>Reporte de compras</Button>
          <Can module="ordenes_compra" action="create">
            <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Nueva orden'}</Button>
          </Can>
        </div>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Input label="Proveedor" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
              <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-2">Ítems</p>
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-6 gap-2 mb-2 items-end">
                <Input label="Nombre" value={it.name} onChange={(e) => updateItemRow(idx, 'name', e.target.value)} required />
                <Input label="Unidad" value={it.unit} onChange={(e) => updateItemRow(idx, 'unit', e.target.value)} required />
                <Input label="Cant. ordenada" type="number" min="0" step="0.01" value={it.quantityOrdered} onChange={(e) => updateItemRow(idx, 'quantityOrdered', e.target.value)} required />
                <Input label="Vr. unitario" type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updateItemRow(idx, 'unitPrice', e.target.value)} required />
                <Select label="Ítem presupuesto (opcional)" value={it.budgetItemId} onChange={(e) => updateItemRow(idx, 'budgetItemId', e.target.value)}>
                  <option value="">-- ninguno --</option>
                  {budgetItems.map((bi) => <option key={bi.id} value={bi.id}>{bi.description}</option>)}
                </Select>
                <Button type="button" variant="danger" onClick={() => removeRow(idx)}>Quitar</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addRow}>+ Agregar ítem</Button>
            <Button type="submit" className="ml-2">Crear orden</Button>
            <ErrorText>{error}</ErrorText>
          </form>
        )}

        <Table columns={['Proveedor', 'Fecha', 'Estado', 'Ítems', '']}>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">{o.supplier}</td>
              <td className="py-2 pr-3">{o.date}</td>
              <td className="py-2 pr-3"><Badge color={STATUS_COLORS[o.status]}>{o.status}</Badge></td>
              <td className="py-2 pr-3">{o.items?.length || 0}</td>
              <td className="py-2 pr-3 text-right">
                <Button variant="secondary" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                  {expandedId === o.id ? 'Cerrar' : 'Detalle'}
                </Button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">Sin órdenes de compra.</td></tr>}
        </Table>
      </Card>

      {expandedId && <OrderDetail projectId={projectId} orderId={expandedId} onChange={load} />}

      {report && (
        <Card title="Reporte consolidado de compras">
          <Table columns={['Fecha', 'Material', 'Cantidad', 'Vr. Unit.', 'Vr. Total', 'Proveedor', 'Ítem presupuesto', 'Estado orden']}>
            {report.rows.map((r) => (
              <tr key={r.receiptId} className="border-b border-gray-100">
                <td className="py-1 pr-3">{r.date}</td>
                <td className="py-1 pr-3">{r.material}</td>
                <td className="py-1 pr-3">{r.quantityReceived} {r.unit}</td>
                <td className="py-1 pr-3">{money(r.unitCost)}</td>
                <td className="py-1 pr-3">{money(r.totalCost)}</td>
                <td className="py-1 pr-3">{r.supplier}</td>
                <td className="py-1 pr-3">{r.budgetItemDescription || '-'}</td>
                <td className="py-1 pr-3"><Badge color={STATUS_COLORS[r.orderStatus]}>{r.orderStatus}</Badge></td>
              </tr>
            ))}
          </Table>
          <p className="text-sm font-semibold mt-2">Total: {money(report.totals.cost)} ({report.totals.quantity} unidades)</p>
        </Card>
      )}
    </div>
  );
}

function OrderDetail({ projectId, orderId, onChange }) {
  const [order, setOrder] = useState(null);
  const [receiptForms, setReceiptForms] = useState({});
  const [closureReason, setClosureReason] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const load = () => purchaseOrdersApi.get(projectId, orderId).then(setOrder);
  useEffect(() => { load(); }, [projectId, orderId]);

  const submitReceipt = async (itemId) => {
    setError(''); setWarning('');
    const data = receiptForms[itemId] || {};
    if (!data.date || !data.quantityReceived) { setError('Fecha y cantidad son obligatorias'); return; }
    try {
      const res = await purchaseOrdersApi.addReceipt(projectId, orderId, itemId, data);
      if (res.warning) setWarning(res.warning);
      setReceiptForms((f) => ({ ...f, [itemId]: {} }));
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const close = async (withReason) => {
    setError('');
    try {
      await purchaseOrdersApi.close(projectId, orderId, withReason ? closureReason : undefined);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  if (!order) return null;
  const canClose = order.status !== 'cerrada' && order.status !== 'cerrada_con_faltantes';
  const fullyDelivered = order.items?.every((i) => i.pending <= 0);

  return (
    <Card title={`Detalle orden - ${order.supplier}`}>
      <Table columns={['Ítem', 'Ordenada', 'Entregada', 'Pendiente', 'Registrar recepción', '']}>
        {order.items?.map((it) => (
          <tr key={it.id} className="border-b border-gray-100 align-top">
            <td className="py-2 pr-3">{it.name} ({it.unit})</td>
            <td className="py-2 pr-3">{Number(it.quantityOrdered)}</td>
            <td className="py-2 pr-3">{it.delivered}</td>
            <td className="py-2 pr-3">{it.pending}</td>
            <td className="py-2 pr-3">
              <Can module="ordenes_compra" action="edit">
                {canClose && (
                  <div className="flex gap-2">
                    <Input type="date" value={receiptForms[it.id]?.date || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], date: e.target.value } }))} />
                    <Input type="number" min="0" step="0.01" placeholder="Cant." value={receiptForms[it.id]?.quantityReceived || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], quantityReceived: e.target.value } }))} />
                    <Button onClick={() => submitReceipt(it.id)}>Registrar</Button>
                  </div>
                )}
              </Can>
            </td>
          </tr>
        ))}
      </Table>
      <ErrorText>{error}</ErrorText>
      {warning && <p className="text-sm text-yellow-600 mt-1">⚠ {warning}</p>}

      {canClose && (
        <Can module="ordenes_compra" action="edit">
          <div className="mt-4 border-t pt-3">
            {fullyDelivered ? (
              <Button onClick={() => close(false)}>Cerrar orden (entrega completa)</Button>
            ) : (
              <div className="flex gap-2 items-end">
                <Input label="Motivo de faltantes (obligatorio)" value={closureReason} onChange={(e) => setClosureReason(e.target.value)} className="w-96" />
                <Button variant="danger" onClick={() => close(true)}>Cerrar con faltantes justificados</Button>
              </div>
            )}
          </div>
        </Can>
      )}
      {order.closureReason && <p className="text-sm text-gray-500 mt-2">Motivo de cierre: {order.closureReason}</p>}
    </Card>
  );
}
