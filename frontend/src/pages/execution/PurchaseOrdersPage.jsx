import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { purchaseOrdersApi, budgetApi, thirdPartiesApi } from '../../api';
import { Card, Button, Input, Select, SearchSelect, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { purchaseOrderPdfUrl } from '../../api/client';
import Can from '../../components/Can';

const STATUS_COLORS = {
  abierta: 'yellow',
  parcial: 'blue',
  cerrada: 'green',
  cerrada_con_faltantes: 'red',
};

const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];

export default function PurchaseOrdersPage() {
  const { t, i18n } = useTranslation();
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
      <Card title={t('execution.purchaseOrders.title')} actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={loadReport}>{t('execution.purchaseOrders.report')}</Button>
          <Can module="ordenes_compra" action="create">
            <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('execution.purchaseOrders.newOrder')}</Button>
          </Can>
        </div>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <SearchSelect
                label={t('execution.purchaseOrders.registeredSupplier')}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={form.supplierId}
                onChange={pickSupplier}
                placeholder={t('execution.purchaseOrders.supplierPlaceholder')}
              />
              <Input label={t('execution.purchaseOrders.supplier')} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value, supplierId: '' })} required />
              <Input label={t('execution.purchaseOrders.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-2">{t('execution.purchaseOrders.items')}</p>
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-2 items-end">
                <Input label={t('execution.purchaseOrders.itemName')} value={it.name} onChange={(e) => updateItemRow(idx, 'name', e.target.value)} required />
                <Input label={t('execution.purchaseOrders.unit')} value={it.unit} onChange={(e) => updateItemRow(idx, 'unit', e.target.value)} required />
                <Input label={t('execution.purchaseOrders.orderedQty')} type="number" min="0" step="0.01" value={it.quantityOrdered} onChange={(e) => updateItemRow(idx, 'quantityOrdered', e.target.value)} required />
                <Input label={t('execution.purchaseOrders.unitValue')} type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updateItemRow(idx, 'unitPrice', e.target.value)} required />
                <SearchSelect
                  label={t('execution.purchaseOrders.budgetItem')}
                  options={budgetItems.map((bi) => ({ value: bi.id, label: bi.description }))}
                  value={it.budgetItemId}
                  onChange={(v) => updateItemRow(idx, 'budgetItemId', v)}
                  placeholder={t('execution.purchaseOrders.nonePlaceholder')}
                />
                <Button type="button" variant="danger" onClick={() => removeRow(idx)}>{t('execution.purchaseOrders.removeRow')}</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addRow}>{t('execution.purchaseOrders.addRow')}</Button>
            <Button type="submit" className="ml-2">{t('execution.purchaseOrders.createOrder')}</Button>
            <ErrorText>{error}</ErrorText>
          </form>
        )}

        <Table columns={[t('execution.purchaseOrders.table.supplier'), t('execution.purchaseOrders.table.date'), t('execution.purchaseOrders.table.status'), t('execution.purchaseOrders.table.items'), t('execution.purchaseOrders.table.expenses'), '']}>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">{o.supplier}</td>
              <td className="py-2 pr-3">{formatDate(o.date)}</td>
              <td className="py-2 pr-3"><Badge color={STATUS_COLORS[o.status]}>{t(`execution.purchaseOrders.status.${o.status}`, o.status)}</Badge></td>
              <td className="py-2 pr-3">{o.items?.length || 0}</td>
              <td className="py-2 pr-3">{o.expenseId ? <Badge color="green">{t('execution.purchaseOrders.transferred')}</Badge> : <span className="text-gray-400 text-xs">-</span>}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                <Button variant="secondary" onClick={() => window.open(purchaseOrderPdfUrl(o.id, i18n.language), '_blank')}>
                  {t('suppliers.orders.pdf')}
                </Button>
                <Button variant="secondary" className="ml-2" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                  {expandedId === o.id ? t('common.close') : t('execution.purchaseOrders.detail')}
                </Button>
              </td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('execution.purchaseOrders.empty')}</td></tr>}
        </Table>
      </Card>

      {expandedId && <OrderDetail projectId={projectId} orderId={expandedId} budgetItems={budgetItems} onChange={load} />}

      {report && (
        <Card title={t('execution.purchaseOrders.reportTitle')}>
          <Table columns={[t('execution.purchaseOrders.reportTable.date'), t('execution.purchaseOrders.reportTable.material'), t('execution.purchaseOrders.reportTable.quantity'), t('execution.purchaseOrders.reportTable.unitValue'), t('execution.purchaseOrders.reportTable.total'), t('execution.purchaseOrders.reportTable.supplier'), t('execution.purchaseOrders.reportTable.budgetItem'), t('execution.purchaseOrders.reportTable.orderStatus')]}>
            {report.rows.map((r) => (
              <tr key={r.receiptId} className="border-b border-gray-100">
                <td className="py-1 pr-3">{formatDate(r.date)}</td>
                <td className="py-1 pr-3">{r.material}</td>
                <td className="py-1 pr-3">{r.quantityReceived} {r.unit}</td>
                <td className="py-1 pr-3">{money(r.unitCost)}</td>
                <td className="py-1 pr-3">{money(r.totalCost)}</td>
                <td className="py-1 pr-3">{r.supplier}</td>
                <td className="py-1 pr-3">{r.budgetItemDescription || '-'}</td>
                <td className="py-1 pr-3"><Badge color={STATUS_COLORS[r.orderStatus]}>{t(`execution.purchaseOrders.status.${r.orderStatus}`, r.orderStatus)}</Badge></td>
              </tr>
            ))}
          </Table>
          <p className="text-sm font-semibold mt-2">{t('execution.purchaseOrders.reportTotal', { amount: money(report.totals.cost), quantity: report.totals.quantity })}</p>
        </Card>
      )}
    </div>
  );
}

function OrderDetail({ projectId, orderId, budgetItems, onChange }) {
  const { t } = useTranslation();
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
    if (!data.date || !data.quantityReceived) { setError(t('execution.purchaseOrders.receiptRequired')); return; }
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
    if (!confirm(t('execution.purchaseOrders.confirmConvertDialog'))) return;
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
    <Card title={t('execution.purchaseOrders.orderDetail', { supplier: order.supplier })}>
      {order.expenseId && (
        <p className="text-sm text-green-700 mb-3 bg-green-50 border border-green-200 rounded px-3 py-2">
          {t('execution.purchaseOrders.transferredNote')}
        </p>
      )}
      <Table columns={[t('execution.purchaseOrders.detailTable.item'), t('execution.purchaseOrders.detailTable.ordered'), t('execution.purchaseOrders.detailTable.delivered'), t('execution.purchaseOrders.detailTable.pending'), t('execution.purchaseOrders.detailTable.registerReceipt'), '']}>
        {order.items?.map((it) => (
          <tr key={it.id} className="border-b border-gray-100 align-top">
            {editingId === it.id ? (
              <>
                <td className="py-2 pr-3" colSpan={4}>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <Input label={t('execution.purchaseOrders.itemName')} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    <Input label={t('execution.purchaseOrders.unit')} value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} />
                    <Input label={t('execution.purchaseOrders.orderedQty')} type="number" min="0" step="0.01" value={editForm.quantityOrdered} onChange={(e) => setEditForm({ ...editForm, quantityOrdered: e.target.value })} />
                    <Input label={t('execution.purchaseOrders.unitValue')} type="number" min="0" step="0.01" value={editForm.unitPrice} onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })} />
                    <SearchSelect
                      label={t('execution.purchaseOrders.budgetItemPlain')}
                      options={budgetItems.map((bi) => ({ value: bi.id, label: bi.description }))}
                      value={editForm.budgetItemId}
                      onChange={(v) => setEditForm({ ...editForm, budgetItemId: v })}
                      placeholder={t('execution.purchaseOrders.nonePlaceholder')}
                    />
                  </div>
                </td>
                <td className="py-2 pr-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <Button onClick={() => saveEdit(it.id)}>{t('execution.purchaseOrders.save')}</Button>
                    <Button variant="secondary" onClick={() => setEditingId(null)}>{t('execution.purchaseOrders.cancel')}</Button>
                  </div>
                </td>
              </>
            ) : (
              <>
                <td className="py-2 pr-3">
                  {it.name} ({it.unit})
                  {!itemsLocked && (
                    <Can module="ordenes_compra" action="edit">
                      <button type="button" className="ml-2 text-xs text-blue-600 hover:underline" onClick={() => startEdit(it)}>{t('execution.purchaseOrders.edit')}</button>
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
                        <Input type="number" min="0" step="0.01" placeholder={t('execution.purchaseOrders.receiptQty')} value={receiptForms[it.id]?.quantityReceived || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], quantityReceived: e.target.value } }))} />
                        <Button onClick={() => submitReceipt(it.id)}>{t('execution.purchaseOrders.register')}</Button>
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
              <Button onClick={() => close(false)}>{t('execution.purchaseOrders.closeComplete')}</Button>
            ) : (
              <div className="flex flex-wrap gap-2 items-end">
                <Input label={t('execution.purchaseOrders.shortageReason')} value={closureReason} onChange={(e) => setClosureReason(e.target.value)} className="w-96" />
                <Button variant="danger" onClick={() => close(true)}>{t('execution.purchaseOrders.closeWithShortages')}</Button>
              </div>
            )}
          </div>
        </Can>
      )}
      {order.closureReason && <p className="text-sm text-gray-500 mt-2">{t('execution.purchaseOrders.closureReasonLabel')}: {order.closureReason}</p>}

      {!order.expenseId && (
        <Can module="ordenes_compra" action="edit">
          <div className="mt-4 border-t pt-3">
            {!showConvert ? (
              <Button variant="secondary" onClick={() => setShowConvert(true)}>{t('execution.purchaseOrders.convertToExpense')}</Button>
            ) : (
              <div className="flex flex-wrap gap-2 items-end">
                <Select label={t('execution.purchaseOrders.expenseCategory')} value={convertForm.category} onChange={(e) => setConvertForm({ ...convertForm, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(`execution.dashboard.categories.${c}`)}</option>)}
                </Select>
                <Input label={t('execution.purchaseOrders.expenseDate')} type="date" value={convertForm.date} onChange={(e) => setConvertForm({ ...convertForm, date: e.target.value })} placeholder={order.date} />
                <Button onClick={convertToExpense}>{t('execution.purchaseOrders.confirmTransfer')}</Button>
                <Button variant="secondary" onClick={() => setShowConvert(false)}>{t('execution.purchaseOrders.cancel')}</Button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{t('execution.purchaseOrders.transferNote', { count: order.items?.length || 0 })}</p>
          </div>
        </Can>
      )}
    </Card>
  );
}
