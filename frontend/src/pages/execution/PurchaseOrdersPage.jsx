import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { purchaseOrdersApi, budgetApi, thirdPartiesApi } from '../../api';
import { Card, Button, Input, Select, SearchSelect, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';

const STATUS_COLORS = {
  abierta: 'yellow',
  parcial: 'blue',
  cerrada: 'green',
  cerrada_con_faltantes: 'red',
};

const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
const CATEGORY_LABELS = { mano_obra: 'Mano de obra', materiales: 'Materiales', equipos: 'Equipos', viaticos: 'Viáticos', imprevistos: 'Imprevistos' };

export default function PurchaseOrdersPage() {
  const { projectId } = useOutletContext();
  const [orders, setOrders] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ supplier: '', supplierId: '', date: '', items: [{ name: '', unit: '', quantityOrdered: '', unitPrice: '', budgetItemId: '' }] });
  const [report, setReport] = useState(null);

  const load = () => purchaseOrdersApi.list(projectId).then(setOrders);
  useEffect(() => {
    load();
    budgetApi.get(projectId).then((d) => setBudgetItems(d.items));
    thirdPartiesApi.list({ type: 'proveedor' }).then(setSuppliers);
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

  const pickSupplier = (supplierId) => {
    const s = suppliers.find((x) => x.id === supplierId);
    setForm((f) => ({ ...f, supplierId, supplier: s ? s.name : f.supplier }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        supplier: form.supplier,
        supplierId: form.supplierId || undefined,
        date: form.date,
        items: form.items.map((it) => ({ ...it, budgetItemId: it.budgetItemId || undefined })),
      };
      await purchaseOrdersApi.create(projectId, payload);
      setForm({ supplier: '', supplierId: '', date: '', items: [{ name: '', unit: '', quantityOrdered: '', unitPrice: '', budgetItemId: '' }] });
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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={loadReport}>Reporte de compras</Button>
          <Can module="ordenes_compra" action="create">
            <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Nueva orden'}</Button>
          </Can>
        </div>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <SearchSelect
                label="Proveedor registrado (opcional)"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={form.supplierId}
                onChange={pickSupplier}
                placeholder="-- ninguno / digitar manualmente --"
              />
              <Input label="Proveedor" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value, supplierId: '' })} required />
              <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-2">Ítems</p>
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-2 items-end">
                <Input label="Nombre" value={it.name} onChange={(e) => updateItemRow(idx, 'name', e.target.value)} required />
                <Input label="Unidad" value={it.unit} onChange={(e) => updateItemRow(idx, 'unit', e.target.value)} required />
                <Input label="Cant. ordenada" type="number" min="0" step="0.01" value={it.quantityOrdered} onChange={(e) => updateItemRow(idx, 'quantityOrdered', e.target.value)} required />
                <Input label="Vr. unitario" type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updateItemRow(idx, 'unitPrice', e.target.value)} required />
                <SearchSelect
                  label="Ítem presupuesto (opcional)"
                  options={budgetItems.map((bi) => ({ value: bi.id, label: bi.description }))}
                  value={it.budgetItemId}
                  onChange={(v) => updateItemRow(idx, 'budgetItemId', v)}
                  placeholder="-- ninguno --"
                />
                <Button type="button" variant="danger" onClick={() => removeRow(idx)}>Quitar</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addRow}>+ Agregar ítem</Button>
            <Button type="submit" className="ml-2">Crear orden</Button>
            <ErrorText>{error}</ErrorText>
          </form>
        )}

        <Table columns={['Proveedor', 'Fecha', 'Estado', 'Ítems', 'Gastos', '']}>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">{o.supplier}</td>
              <td className="py-2 pr-3">{o.date}</td>
              <td className="py-2 pr-3"><Badge color={STATUS_COLORS[o.status]}>{o.status}</Badge></td>
              <td className="py-2 pr-3">{o.items?.length || 0}</td>
              <td className="py-2 pr-3">{o.expenseId ? <Badge color="green">Trasladada</Badge> : <span className="text-gray-400 text-xs">-</span>}</td>
              <td className="py-2 pr-3 text-right">
                <Button variant="secondary" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                  {expandedId === o.id ? 'Cerrar' : 'Detalle'}
                </Button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">Sin órdenes de compra.</td></tr>}
        </Table>
      </Card>

      {expandedId && <OrderDetail projectId={projectId} orderId={expandedId} budgetItems={budgetItems} onChange={load} />}

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

function OrderDetail({ projectId, orderId, budgetItems, onChange }) {
  const [order, setOrder] = useState(null);
  const [receiptForms, setReceiptForms] = useState({});
  const [closureReason, setClosureReason] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [convertForm, setConvertForm] = useState({ category: 'materiales', date: '' });
  const [showConvert, setShowConvert] = useState(false);
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

  const startEdit = (it) => {
    setEditingId(it.id);
    setEditForm({ name: it.name, unit: it.unit, quantityOrdered: it.quantityOrdered, unitPrice: it.unitPrice, budgetItemId: it.budgetItemId || '' });
  };

  const saveEdit = async (itemId) => {
    setError('');
    try {
      await purchaseOrdersApi.updateItem(projectId, orderId, itemId, {
        ...editForm,
        budgetItemId: editForm.budgetItemId || null,
      });
      setEditingId(null);
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

  const convertToExpense = async () => {
    setError('');
    if (!confirm('¿Trasladar todos los ítems de esta orden a un gasto del proyecto? Esta acción no se puede deshacer ni repetir para la misma orden.')) return;
    try {
      await purchaseOrdersApi.convertToExpense(projectId, orderId, convertForm);
      setShowConvert(false);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  if (!order) return null;
  const canClose = order.status !== 'cerrada' && order.status !== 'cerrada_con_faltantes';
  const fullyDelivered = order.items?.every((i) => i.pending <= 0);
  const itemsLocked = !canClose || !!order.expenseId;

  return (
    <Card title={`Detalle orden - ${order.supplier}`}>
      {order.expenseId && (
        <p className="text-sm text-green-700 mb-3 bg-green-50 border border-green-200 rounded px-3 py-2">
          Esta orden ya fue trasladada a Gastos. Sus ítems no pueden editarse ni volver a trasladarse.
        </p>
      )}
      <Table columns={['Ítem', 'Ordenada', 'Entregada', 'Pendiente', 'Registrar recepción', '']}>
        {order.items?.map((it) => (
          <tr key={it.id} className="border-b border-gray-100 align-top">
            {editingId === it.id ? (
              <>
                <td className="py-2 pr-3" colSpan={4}>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <Input label="Nombre" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    <Input label="Unidad" value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} />
                    <Input label="Cant. ordenada" type="number" min="0" step="0.01" value={editForm.quantityOrdered} onChange={(e) => setEditForm({ ...editForm, quantityOrdered: e.target.value })} />
                    <Input label="Vr. unitario" type="number" min="0" step="0.01" value={editForm.unitPrice} onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })} />
                    <SearchSelect
                      label="Ítem presupuesto"
                      options={budgetItems.map((bi) => ({ value: bi.id, label: bi.description }))}
                      value={editForm.budgetItemId}
                      onChange={(v) => setEditForm({ ...editForm, budgetItemId: v })}
                      placeholder="-- ninguno --"
                    />
                  </div>
                </td>
                <td className="py-2 pr-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <Button onClick={() => saveEdit(it.id)}>Guardar</Button>
                    <Button variant="secondary" onClick={() => setEditingId(null)}>Cancelar</Button>
                  </div>
                </td>
              </>
            ) : (
              <>
                <td className="py-2 pr-3">
                  {it.name} ({it.unit})
                  {!itemsLocked && (
                    <Can module="ordenes_compra" action="edit">
                      <button type="button" className="ml-2 text-xs text-blue-600 hover:underline" onClick={() => startEdit(it)}>Editar</button>
                    </Can>
                  )}
                </td>
                <td className="py-2 pr-3">{Number(it.quantityOrdered)}</td>
                <td className="py-2 pr-3">{it.delivered}</td>
                <td className="py-2 pr-3">{it.pending}</td>
                <td className="py-2 pr-3">
                  <Can module="ordenes_compra" action="edit">
                    {canClose && (
                      <div className="flex flex-wrap gap-2">
                        <Input type="date" value={receiptForms[it.id]?.date || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], date: e.target.value } }))} />
                        <Input type="number" min="0" step="0.01" placeholder="Cant." value={receiptForms[it.id]?.quantityReceived || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], quantityReceived: e.target.value } }))} />
                        <Button onClick={() => submitReceipt(it.id)}>Registrar</Button>
                      </div>
                    )}
                  </Can>
                </td>
              </>
            )}
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
              <div className="flex flex-wrap gap-2 items-end">
                <Input label="Motivo de faltantes (obligatorio)" value={closureReason} onChange={(e) => setClosureReason(e.target.value)} className="w-96" />
                <Button variant="danger" onClick={() => close(true)}>Cerrar con faltantes justificados</Button>
              </div>
            )}
          </div>
        </Can>
      )}
      {order.closureReason && <p className="text-sm text-gray-500 mt-2">Motivo de cierre: {order.closureReason}</p>}

      {!order.expenseId && (
        <Can module="ordenes_compra" action="edit">
          <div className="mt-4 border-t pt-3">
            {!showConvert ? (
              <Button variant="secondary" onClick={() => setShowConvert(true)}>Pasar a Gastos</Button>
            ) : (
              <div className="flex flex-wrap gap-2 items-end">
                <Select label="Categoría del gasto" value={convertForm.category} onChange={(e) => setConvertForm({ ...convertForm, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </Select>
                <Input label="Fecha del gasto" type="date" value={convertForm.date} onChange={(e) => setConvertForm({ ...convertForm, date: e.target.value })} placeholder={order.date} />
                <Button onClick={convertToExpense}>Confirmar traslado a Gastos</Button>
                <Button variant="secondary" onClick={() => setShowConvert(false)}>Cancelar</Button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Traslada todos los ítems de la orden ({order.items?.length || 0}) a un gasto del proyecto, con la misma descripción, cantidad y valor. Solo se puede hacer una vez por orden.</p>
          </div>
        </Can>
      )}
    </Card>
  );
}
