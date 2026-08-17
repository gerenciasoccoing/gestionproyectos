import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { thirdPartiesApi, supplierPurchaseOrdersApi, projectsApi, budgetApi, cashBoxesApi } from '../../api';
import { Card, Button, Input, Select, SearchSelect, TextArea, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl, purchaseOrderPdfUrl } from '../../api/client';
import Can from '../../components/Can';

const emptyForm = { name: '', nit: '', email: '', phone: '', address: '', contactName: '', notes: '' };
const STATUS_COLORS = { abierta: 'yellow', parcial: 'blue', cerrada: 'green', cerrada_con_faltantes: 'red' };
const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];

// Compara NIT sin importar puntos/guiones/espacios ni mayúsculas (ej. "900.303.701-0" === "9003037010").
function normalizeNit(nit) {
  return String(nit || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

// Sección "Proveedores" independiente de "Clientes" (antes era una sola página con pestañas que
// compartían un `type` de formulario — separarlas evita por completo el riesgo de guardar un
// cliente en la tabla de proveedores o viceversa: cada página solo conoce su propio tipo).
export default function SuppliersPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [rutFile, setRutFile] = useState(null);
  const [bankFile, setBankFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => thirdPartiesApi.list({ type: 'proveedor' }).then(setItems);
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setRutFile(null);
    setBankFile(null);
    setScanNotice('');
    setEditingId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name, nit: item.nit || '', email: item.email || '',
      phone: item.phone || '', address: item.address || '', contactName: item.contactName || '', notes: item.notes || '',
    });
    setRutFile(null);
    setBankFile(null);
    setScanNotice('');
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const normalized = normalizeNit(form.nit);
    if (normalized) {
      const dup = items.find((it) => it.id !== editingId && normalizeNit(it.nit) === normalized);
      if (dup) {
        setError(t('thirdParties.duplicateNitSupplier', { name: dup.name }));
        return;
      }
    }

    try {
      const fd = new FormData();
      fd.append('type', 'proveedor');
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (rutFile) fd.append('rutFile', rutFile);
      if (bankFile) fd.append('bankCertificationFile', bankFile);
      if (editingId) await thirdPartiesApi.update(editingId, fd);
      else await thirdPartiesApi.create(fd);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const scanRutFile = async () => {
    if (!rutFile) return;
    setScanning(true);
    setError('');
    setScanNotice('');
    try {
      const fd = new FormData();
      fd.append('file', rutFile);
      const result = await thirdPartiesApi.scanRut(fd);
      setForm((f) => ({
        ...f,
        name: result.name || f.name,
        nit: result.nit || f.nit,
        email: result.email || f.email,
        phone: result.phone || f.phone,
      }));
      setScanNotice(t('thirdParties.scanDone'));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t('thirdParties.confirmDelete'))) return;
    await thirdPartiesApi.remove(id);
    if (expandedId === id) setExpandedId(null);
    load();
  };

  const filtered = search
    ? items.filter((it) => it.name.toLowerCase().includes(search.toLowerCase()) || (it.nit || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  const expandedSupplier = items.find((it) => it.id === expandedId);

  return (
    <div>
      <Card title={t('thirdParties.tabs.suppliers')}>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <Input label={t('thirdParties.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Can module="terceros" action="create">
            <Button onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s); }}>
              {showForm ? t('common.cancel') : t('thirdParties.newSupplier')}
            </Button>
          </Can>
        </div>

        {showForm && (
          <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 items-end">
              <Input
                label={t('thirdParties.rut')}
                type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => { setRutFile(e.target.files[0]); setScanNotice(''); }}
              />
              <Button type="button" variant="secondary" disabled={!rutFile || scanning} onClick={scanRutFile}>
                {scanning ? t('thirdParties.readingRut') : t('thirdParties.readRutAuto')}
              </Button>
            </div>
            {scanNotice && <p className="text-sm text-green-700 mb-3">{scanNotice}</p>}
            <p className="text-xs text-gray-400 mb-3">{t('thirdParties.scanNote')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label={t('thirdParties.fields.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label={t('thirdParties.fields.nit')} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
              <Input label={t('thirdParties.fields.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label={t('thirdParties.fields.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label={t('thirdParties.fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <Input label={t('thirdParties.fields.contactName')} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <TextArea label={t('thirdParties.fields.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="col-span-full" rows={2} />
              <Input
                label={t('thirdParties.fields.bankCertification')}
                type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setBankFile(e.target.files[0])}
                className="col-span-full sm:col-span-1"
              />
              <Button type="submit" className="col-span-full">{editingId ? t('thirdParties.saveChanges') : t('thirdParties.save')}</Button>
              <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
            </div>
          </form>
        )}

        <Table columns={[t('thirdParties.table.name'), t('thirdParties.table.nit'), t('thirdParties.table.email'), t('thirdParties.table.phone'), t('thirdParties.table.rut'), t('thirdParties.table.bankCertification'), '']}>
          {filtered.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{it.name}</td>
              <td className="py-1 pr-3">{it.nit || '-'}</td>
              <td className="py-1 pr-3">{it.email || '-'}</td>
              <td className="py-1 pr-3">{it.phone || '-'}</td>
              <td className="py-1 pr-3">{it.rutFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(it.rutFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
              <td className="py-1 pr-3">{it.bankCertificationFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(it.bankCertificationFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <Can module="ordenes_compra" action="view">
                  <Button variant="secondary" onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}>
                    {expandedId === it.id ? t('common.close') : t('suppliers.orders.toggle')}
                  </Button>
                </Can>
                <Can module="terceros" action="edit">
                  <Button variant="secondary" className="ml-2" onClick={() => startEdit(it)}>{t('common.edit')}</Button>
                </Can>
                <Can module="terceros" action="delete">
                  <Button variant="danger" className="ml-2" onClick={() => remove(it.id)}>{t('common.delete')}</Button>
                </Can>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={7} className="py-3 text-center text-gray-400">{t('thirdParties.emptySuppliers')}</td></tr>}
        </Table>
      </Card>

      {expandedSupplier && <SupplierOrders supplier={expandedSupplier} />}
    </div>
  );
}

function emptyOrderLine() { return { name: '', unit: '', quantityOrdered: '', unitPrice: '', budgetItemId: '' }; }

// Panel de órdenes de compra de un proveedor: reutiliza el mismo modelo/endpoints de órdenes de
// compra que Ejecución de proyecto (supplierPurchaseOrdersApi -> /purchase-orders), solo que aquí
// el proyecto es opcional. Si se asigna, la orden queda visible también en Ejecución > Órdenes de
// Compra de ese proyecto automáticamente (el backend la filtra por projectId en ambos lados).
function SupplierOrders({ supplier }) {
  const { t, i18n } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ projectId: '', date: '', items: [emptyOrderLine()] });
  const [error, setError] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const load = () => supplierPurchaseOrdersApi.list(supplier.id).then(setOrders);
  useEffect(() => { load(); projectsApi.list().then(setProjects); }, [supplier.id]);
  useEffect(() => {
    if (form.projectId) budgetApi.get(form.projectId).then((d) => setBudgetItems(d.items)).catch(() => setBudgetItems([]));
    else setBudgetItems([]);
  }, [form.projectId]);

  const resetForm = () => setForm({ projectId: '', date: '', items: [emptyOrderLine()] });
  const updateItemRow = (idx, field, value) => setForm((f) => {
    const items = [...f.items];
    items[idx] = { ...items[idx], [field]: value };
    return { ...f, items };
  });
  const addRow = () => setForm((f) => ({ ...f, items: [...f.items, emptyOrderLine()] }));
  const removeRow = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await supplierPurchaseOrdersApi.create({
        supplier: supplier.name,
        supplierId: supplier.id,
        projectId: form.projectId || undefined,
        date: form.date,
        items: form.items.map((it) => ({ ...it, budgetItemId: it.budgetItemId || undefined })),
      });
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={t('suppliers.orders.title', { name: supplier.name })}>
      <Can module="ordenes_compra" action="create">
        <Button onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s); }} className="mb-3">
          {showForm ? t('common.cancel') : t('suppliers.orders.newOrder')}
        </Button>
      </Can>

      {showForm && (
        <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <SearchSelect
              label={t('suppliers.orders.assignProject')}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              value={form.projectId}
              onChange={(v) => setForm((f) => ({ ...f, projectId: v, items: f.items.map((it) => ({ ...it, budgetItemId: '' })) }))}
              placeholder={t('suppliers.orders.noProjectPlaceholder')}
            />
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
                placeholder={form.projectId ? t('execution.purchaseOrders.nonePlaceholder') : t('suppliers.orders.noProjectPlaceholder')}
                disabled={!form.projectId}
              />
              <Button type="button" variant="danger" onClick={() => removeRow(idx)}>{t('execution.purchaseOrders.removeRow')}</Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addRow}>{t('execution.purchaseOrders.addRow')}</Button>
          <Button type="submit" className="ml-2">{t('execution.purchaseOrders.createOrder')}</Button>
          <ErrorText>{error}</ErrorText>
        </form>
      )}

      <Table columns={[t('suppliers.orders.table.number'), t('suppliers.orders.table.project'), t('execution.purchaseOrders.table.date'), t('execution.purchaseOrders.table.status'), t('execution.purchaseOrders.table.items'), '']}>
        {orders.map((o) => (
          <tr key={o.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{o.orderNumber || '-'}</td>
            <td className="py-1 pr-3">{o.Project?.name || <span className="text-gray-400">{t('suppliers.orders.noProject')}</span>}</td>
            <td className="py-1 pr-3">{formatDate(o.date)}</td>
            <td className="py-1 pr-3"><Badge color={STATUS_COLORS[o.status]}>{t(`execution.purchaseOrders.status.${o.status}`, o.status)}</Badge></td>
            <td className="py-1 pr-3">{o.items?.length || 0}</td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Button variant="secondary" onClick={() => window.open(purchaseOrderPdfUrl(o.id, i18n.language), '_blank')}>{t('suppliers.orders.pdf')}</Button>
              <Button variant="secondary" className="ml-2" onClick={() => setExpandedOrderId(expandedOrderId === o.id ? null : o.id)}>
                {expandedOrderId === o.id ? t('common.close') : t('execution.purchaseOrders.detail')}
              </Button>
            </td>
          </tr>
        ))}
        {orders.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('suppliers.orders.empty')}</td></tr>}
      </Table>

      {expandedOrderId && <SupplierOrderDetail orderId={expandedOrderId} onChange={load} />}
    </Card>
  );
}

// Detalle de una orden creada desde Proveedores: registrar recepciones, cerrar (con o sin
// faltantes) y pasar a gastos — igual que en Ejecución de proyecto (OrderDetail en
// PurchaseOrdersPage.jsx), salvo que recepciones/traslado a gastos requieren que la orden tenga
// proyecto asignado (un gasto siempre pertenece a un proyecto; el backend ya lo valida, aquí solo
// se explica por qué esos controles no aparecen).
function SupplierOrderDetail({ orderId, onChange }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState(null);
  const [receiptForms, setReceiptForms] = useState({});
  const [closureReason, setClosureReason] = useState('');
  const [convertForm, setConvertForm] = useState({ category: 'materiales', date: '', cashBoxId: '' });
  const [showConvert, setShowConvert] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [cashBoxes, setCashBoxes] = useState([]);

  const cashBoxOptions = cashBoxes.filter((cb) => cb.status === 'activa');

  const load = () => supplierPurchaseOrdersApi.get(orderId).then(setOrder);
  useEffect(() => { load(); cashBoxesApi.list().then(setCashBoxes); }, [orderId]);

  const submitReceipt = async (itemId) => {
    setError(''); setWarning('');
    const data = receiptForms[itemId] || {};
    if (!data.date || !data.quantityReceived) { setError(t('execution.purchaseOrders.receiptRequired')); return; }
    if (!data.cashBoxId) { setError(t('expenses.cashBoxRequired')); return; }
    try {
      const res = await supplierPurchaseOrdersApi.addReceipt(orderId, itemId, data);
      if (res.warning) setWarning(res.warning);
      if (res.cashBoxWarning) setWarning((w) => (w ? `${w} ${res.cashBoxWarning}` : res.cashBoxWarning));
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
      await supplierPurchaseOrdersApi.close(orderId, withReason ? closureReason : undefined);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const convertToExpense = async () => {
    setError('');
    if (!convertForm.cashBoxId) { setError(t('expenses.cashBoxRequired')); return; }
    if (!confirm(t('execution.purchaseOrders.confirmConvertDialog'))) return;
    try {
      const res = await supplierPurchaseOrdersApi.convertToExpense(orderId, convertForm);
      if (res.warning) setWarning(res.warning);
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
  const hasProject = !!order.projectId;

  return (
    <Card title={t('execution.purchaseOrders.orderDetail', { supplier: order.supplier })} className="mt-3">
      {!hasProject && (
        <p className="text-sm text-yellow-700 mb-3 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          {t('suppliers.orders.noProjectNote')}
        </p>
      )}
      {order.expenseId && (
        <p className="text-sm text-green-700 mb-3 bg-green-50 border border-green-200 rounded px-3 py-2">
          {t('execution.purchaseOrders.transferredNote')}
        </p>
      )}
      <Table columns={[t('execution.purchaseOrders.detailTable.item'), t('execution.purchaseOrders.detailTable.ordered'), t('execution.purchaseOrders.detailTable.delivered'), t('execution.purchaseOrders.detailTable.pending'), hasProject ? t('execution.purchaseOrders.detailTable.registerReceipt') : '']}>
        {order.items?.map((it) => (
          <tr key={it.id} className="border-b border-gray-100 align-top">
            <td className="py-2 pr-3">{it.name} ({it.unit})</td>
            <td className="py-2 pr-3">{Number(it.quantityOrdered)}</td>
            <td className="py-2 pr-3">{it.delivered}</td>
            <td className="py-2 pr-3">{it.pending}</td>
            <td className="py-2 pr-3">
              {hasProject && (
                <Can module="ordenes_compra" action="edit">
                  {canClose && (
                    <div className="flex flex-wrap gap-2">
                      <Input type="date" value={receiptForms[it.id]?.date || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], date: e.target.value } }))} />
                      <Input type="number" min="0" step="0.01" placeholder={t('execution.purchaseOrders.receiptQty')} value={receiptForms[it.id]?.quantityReceived || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], quantityReceived: e.target.value } }))} />
                      <Select value={receiptForms[it.id]?.cashBoxId || ''} onChange={(e) => setReceiptForms((f) => ({ ...f, [it.id]: { ...f[it.id], cashBoxId: e.target.value } }))}>
                        <option value="">{t('expenses.cashBox')}</option>
                        {cashBoxOptions.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({money(cb.balance)})</option>)}
                      </Select>
                      <Button onClick={() => submitReceipt(it.id)}>{t('execution.purchaseOrders.register')}</Button>
                    </div>
                  )}
                </Can>
              )}
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

      {hasProject && !order.expenseId && (
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
                <Select label={t('expenses.cashBox')} value={convertForm.cashBoxId} onChange={(e) => setConvertForm({ ...convertForm, cashBoxId: e.target.value })}>
                  <option value="">{t('common.selectPlaceholder')}</option>
                  {cashBoxOptions.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({money(cb.balance)})</option>)}
                </Select>
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
