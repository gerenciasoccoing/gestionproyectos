import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { expensesApi, generalExpensesApi, projectsApi, thirdPartiesApi, cashBoxesApi } from '../../api';
import { Card, Button, Input, Select, SearchSelect, TextArea, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
const emptyForm = {
  category: 'materiales', amount: '', date: '', description: '',
  vendorName: '', vendorNit: '', vendorPhone: '', vendorEmail: '',
  cashBoxId: '', supplierId: '', projectId: '',
};
const emptyItem = { description: '', quantity: '1', unitPrice: '', totalPrice: '' };
const emptyTax = { name: '', rate: '', amount: '' };
const emptyFilters = { projectId: '', supplierId: '', cashBoxId: '', from: '', to: '' };
const TAX_CODE_SUGGESTIONS = ['IVA', 'ReteIVA', 'ReteICA', 'ICA', 'Impoconsumo'];

function sum(list, field) {
  return list.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

// Un solo componente para las DOS vistas de Gastos: dentro de un proyecto (useOutletContext trae
// projectId, ver ProjectLayout.jsx) y la vista general del menú principal (sin ese contexto,
// projectId queda undefined). Mismo modelo de datos y misma lógica en ambos casos — ver
// expenseController.js en el backend, que atiende los dos montajes de ruta con las mismas
// funciones — solo cambia qué API se llama y qué controles adicionales se muestran (filtros y
// resumen de presupuesto son exclusivos de cada modo).
export default function ExpensesPage() {
  const { t } = useTranslation();
  const outletCtx = useOutletContext();
  const projectId = outletCtx?.projectId;
  const isGeneral = !projectId;

  const api = isGeneral
    ? {
      list: (params) => generalExpensesApi.list(params),
      create: (fd) => generalExpensesApi.create(fd),
      remove: (id) => generalExpensesApi.remove(id),
      scan: (fd) => generalExpensesApi.scan(fd),
    }
    : {
      list: () => expensesApi.list(projectId),
      create: (fd) => expensesApi.create(projectId, fd),
      remove: (id) => expensesApi.remove(projectId, id),
      scan: (fd) => expensesApi.scan(projectId, fd),
    };

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [paymentReceiptFile, setPaymentReceiptFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [budgetForm, setBudgetForm] = useState({ category: 'materiales', budgetedAmount: '' });
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [cashBoxes, setCashBoxes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);

  const LABELS = Object.fromEntries(CATEGORIES.map((c) => [c, t(`expenses.categories.${c}`)]));
  const cashBoxOptions = cashBoxes.filter((cb) => cb.status === 'activa' || cb.id === form.cashBoxId);

  const load = () => {
    const params = isGeneral
      ? {
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        ...(filters.cashBoxId ? { cashBoxId: filters.cashBoxId } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      }
      : undefined;
    api.list(params).then(setExpenses);
    if (!isGeneral) expensesApi.summary(projectId).then(setSummary);
  };
  useEffect(() => { load(); }, [projectId, filters]);
  useEffect(() => {
    cashBoxesApi.list().then(setCashBoxes);
    thirdPartiesApi.list({ type: 'proveedor' }).then(setSuppliers);
    if (isGeneral) projectsApi.list().then(setProjects);
  }, [isGeneral]);

  const itemsSubtotal = sum(items, 'totalPrice');
  const taxesTotal = sum(taxes, 'amount');

  const resetForm = () => {
    setForm(emptyForm);
    setItems([]);
    setTaxes([]);
    setInvoiceFile(null);
    setPaymentReceiptFile(null);
    setScanNotice('');
  };

  const pickSupplier = (supplierId) => {
    const s = suppliers.find((x) => x.id === supplierId);
    setForm((f) => ({ ...f, supplierId, vendorName: s ? s.name : f.vendorName, vendorNit: s?.nit || f.vendorNit, vendorPhone: s?.phone || f.vendorPhone, vendorEmail: s?.email || f.vendorEmail }));
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    setWarning('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'projectId' && !isGeneral) return; // en modo proyecto el projectId lo fija la URL, no se envía
        fd.append(k, v);
      });
      fd.append('subtotal', itemsSubtotal || '');
      fd.append('taxAmount', taxesTotal || '');
      fd.append('items', JSON.stringify(items.filter((it) => it.description.trim())));
      fd.append('taxes', JSON.stringify(taxes.filter((tx) => tx.name.trim())));
      if (invoiceFile) fd.append('invoiceFile', invoiceFile);
      if (paymentReceiptFile) fd.append('paymentReceiptFile', paymentReceiptFile);
      const created = await api.create(fd);
      if (created.warning) setWarning(created.warning);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const scanFile = async () => {
    if (!invoiceFile) return;
    setScanning(true);
    setError('');
    setScanNotice('');
    try {
      const fd = new FormData();
      fd.append('file', invoiceFile);
      const result = await api.scan(fd);
      setForm((f) => ({
        ...f,
        amount: result.total != null ? String(result.total) : f.amount,
        date: result.date || f.date,
        vendorName: result.vendorName || f.vendorName,
        vendorNit: result.vendorNit || f.vendorNit,
        vendorPhone: result.vendorPhone || f.vendorPhone,
        vendorEmail: result.vendorEmail || f.vendorEmail,
      }));
      if (result.items && result.items.length) {
        setItems(result.items.map((it) => ({
          description: it.description || '',
          quantity: it.quantity != null ? String(it.quantity) : '1',
          unitPrice: it.unitPrice != null ? String(it.unitPrice) : '',
          totalPrice: it.totalPrice != null ? String(it.totalPrice) : '',
        })));
      }
      if (result.taxes && result.taxes.length) {
        setTaxes(result.taxes.map((tx) => ({
          name: tx.name || '',
          rate: tx.rate != null ? String(tx.rate) : '',
          amount: tx.amount != null ? String(tx.amount) : '',
        })));
      }
      setScanNotice(t('expenses.scanDone'));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

  const updateItem = (idx, field, value) => {
    setItems((list) => list.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const q = Number(field === 'quantity' ? value : it.quantity) || 0;
        const u = Number(field === 'unitPrice' ? value : it.unitPrice) || 0;
        updated.totalPrice = q && u ? String(q * u) : updated.totalPrice;
      }
      return updated;
    }));
  };
  const addItem = () => setItems((list) => [...list, { ...emptyItem }]);
  const removeItem = (idx) => setItems((list) => list.filter((_, i) => i !== idx));

  const updateTax = (idx, field, value) => {
    setTaxes((list) => list.map((tx, i) => (i === idx ? { ...tx, [field]: value } : tx)));
  };
  const addTax = () => setTaxes((list) => [...list, { ...emptyTax }]);
  const removeTax = (idx) => setTaxes((list) => list.filter((_, i) => i !== idx));

  const submitBudget = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await expensesApi.setBudget(projectId, budgetForm);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (id) => {
    if (!confirm(t('expenses.confirmDelete'))) return;
    await api.remove(id);
    load();
  };

  return (
    <div>
      {isGeneral && (
        <Card title={t('expenses.filters.title')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <SearchSelect
              label={t('expenses.filters.project')}
              options={[{ value: 'none', label: t('expenses.filters.noProject') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              value={filters.projectId}
              onChange={(v) => setFilters((f) => ({ ...f, projectId: v }))}
              placeholder={t('expenses.filters.allProjects')}
            />
            <SearchSelect
              label={t('expenses.filters.supplier')}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={filters.supplierId}
              onChange={(v) => setFilters((f) => ({ ...f, supplierId: v }))}
              placeholder={t('expenses.filters.allSuppliers')}
            />
            <Select label={t('expenses.filters.cashBox')} value={filters.cashBoxId} onChange={(e) => setFilters((f) => ({ ...f, cashBoxId: e.target.value }))}>
              <option value="">{t('expenses.filters.allCashBoxes')}</option>
              {cashBoxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name}</option>)}
            </Select>
            <Input label={t('expenses.filters.from')} type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
            <Input label={t('expenses.filters.to')} type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
          {(filters.projectId || filters.supplierId || filters.cashBoxId || filters.from || filters.to) && (
            <Button variant="secondary" className="mt-3" onClick={() => setFilters(emptyFilters)}>{t('expenses.filters.clear')}</Button>
          )}
        </Card>
      )}

      {!isGeneral && summary && (
        <Card title={t('expenses.summaryTitle')}>
          <Table columns={[t('expenses.table.category'), t('expenses.table.budgeted'), t('expenses.table.spent'), t('expenses.table.available')]}>
            {summary.rows.map((r) => (
              <tr key={r.category} className="border-b border-gray-100">
                <td className="py-1 pr-3">{LABELS[r.category]}</td>
                <td className="py-1 pr-3">{money(r.budgetedAmount)}</td>
                <td className="py-1 pr-3">{money(r.spent)}</td>
                <td className={`py-1 pr-3 ${r.available < 0 ? 'text-red-600 font-semibold' : ''}`}>{money(r.available)}</td>
              </tr>
            ))}
          </Table>
          <p className="text-sm font-semibold mt-2">{t('expenses.totalLine', { budgeted: money(summary.totals.budgetedAmount), spent: money(summary.totals.spent) })}</p>
          <Can module="gastos" action="edit">
            <form onSubmit={submitBudget} className="flex flex-wrap gap-2 items-end mt-3 border-t pt-3">
              <Select label={t('expenses.category')} value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
              </Select>
              <Input label={t('expenses.budgetedValue')} type="number" min="0" step="0.01" value={budgetForm.budgetedAmount} onChange={(e) => setBudgetForm({ ...budgetForm, budgetedAmount: e.target.value })} required />
              <Button type="submit">{t('expenses.setBudget')}</Button>
            </form>
          </Can>
        </Card>
      )}

      <Card title={t('expenses.registeredTitle')} actions={
        <Can module="gastos" action="create">
          <Button onClick={() => { setShowForm((s) => !s); if (showForm) resetForm(); }}>{showForm ? t('common.cancel') : t('expenses.add')}</Button>
        </Can>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 items-end">
              <Input
                label={t('expenses.invoice')}
                type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => { setInvoiceFile(e.target.files[0]); setScanNotice(''); }}
              />
              <Button type="button" variant="secondary" disabled={!invoiceFile || scanning} onClick={scanFile}>
                {scanning ? t('expenses.reading') : t('expenses.readAuto')}
              </Button>
              <Input
                label={t('expenses.paymentReceipt')}
                type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setPaymentReceiptFile(e.target.files[0])}
              />
            </div>
            {scanNotice && <p className="text-sm text-green-700 mb-3">{scanNotice}</p>}
            <p className="text-xs text-gray-400 mb-3">
              {t('expenses.scanNote')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Select label={t('expenses.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
              </Select>
              <Input label={t('expenses.totalValue')} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              <Input label={t('expenses.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              <Select label={t('expenses.cashBox')} value={form.cashBoxId} onChange={(e) => setForm({ ...form, cashBoxId: e.target.value })} required>
                <option value="">{t('common.selectPlaceholder')}</option>
                {cashBoxOptions.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({money(cb.balance)})</option>)}
              </Select>
              {isGeneral && (
                <SearchSelect
                  label={t('expenses.assignProject')}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  value={form.projectId}
                  onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
                  placeholder={t('expenses.filters.noProject')}
                />
              )}
              <SearchSelect
                label={t('expenses.registeredSupplier')}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={form.supplierId}
                onChange={pickSupplier}
                placeholder={t('expenses.supplierPlaceholder')}
              />
              <Input label={t('expenses.vendor')} value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value, supplierId: '' })} />
              <Input label={t('expenses.vendorNit')} value={form.vendorNit} onChange={(e) => setForm({ ...form, vendorNit: e.target.value })} />
              <Input label={t('expenses.vendorPhone')} value={form.vendorPhone} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} />
              <Input label={t('expenses.vendorEmail')} type="email" value={form.vendorEmail} onChange={(e) => setForm({ ...form, vendorEmail: e.target.value })} />
              <TextArea label={t('expenses.notes')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-full" rows={2} />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-gray-700">{t('expenses.invoiceItems')}</h4>
                <Button type="button" variant="secondary" onClick={addItem}>{t('expenses.addItem')}</Button>
              </div>
              <Table columns={[t('expenses.itemsTable.description'), t('expenses.itemsTable.quantity'), t('expenses.itemsTable.unitValue'), t('expenses.itemsTable.total'), '']}>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1 pr-2"><Input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-28"><Input type="number" min="0" step="any" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-36"><Input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-36"><Input type="number" min="0" step="0.01" value={it.totalPrice} onChange={(e) => updateItem(idx, 'totalPrice', e.target.value)} /></td>
                    <td className="py-1 text-right"><Button type="button" variant="danger" onClick={() => removeItem(idx)}>{t('common.remove')}</Button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-gray-400 text-sm">{t('expenses.noItems')}</td></tr>}
              </Table>
              {items.length > 0 && <p className="text-sm text-gray-600 mt-1 text-right">{t('expenses.itemsSubtotal', { amount: money(itemsSubtotal) })}</p>}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-gray-700">{t('expenses.invoiceTaxes')}</h4>
                <Button type="button" variant="secondary" onClick={addTax}>{t('expenses.addTax')}</Button>
              </div>
              <datalist id="tax-name-suggestions">
                {TAX_CODE_SUGGESTIONS.map((n) => <option key={n} value={n} />)}
                <option value={t('expenses.taxNames.reteFuente')} />
              </datalist>
              <Table columns={[t('expenses.taxesTable.tax'), t('expenses.taxesTable.rate'), t('expenses.taxesTable.value'), '']}>
                {taxes.map((tx, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1 pr-2"><Input list="tax-name-suggestions" value={tx.name} onChange={(e) => updateTax(idx, 'name', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-28"><Input type="number" min="0" step="any" value={tx.rate} onChange={(e) => updateTax(idx, 'rate', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-36"><Input type="number" min="0" step="0.01" value={tx.amount} onChange={(e) => updateTax(idx, 'amount', e.target.value)} /></td>
                    <td className="py-1 text-right"><Button type="button" variant="danger" onClick={() => removeTax(idx)}>{t('common.remove')}</Button></td>
                  </tr>
                ))}
                {taxes.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-gray-400 text-sm">{t('expenses.noTaxes')}</td></tr>}
              </Table>
              {taxes.length > 0 && <p className="text-sm text-gray-600 mt-1 text-right">{t('expenses.taxesTotal', { amount: money(taxesTotal) })}</p>}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button type="submit" loading={submitting}>{t('expenses.save')}</Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        )}
        {warning && <p className="text-sm text-yellow-600 mb-3">⚠ {warning}</p>}
        <Table columns={[
          t('expenses.list.date'), t('expenses.list.category'), t('expenses.list.vendor'),
          ...(isGeneral ? [t('expenses.list.project'), t('expenses.list.cashBox')] : []),
          t('expenses.list.items'), t('expenses.list.value'), t('expenses.list.origin'), t('expenses.list.invoice'), t('expenses.list.receipt'), '',
        ]}>
          {expenses.map((e) => (
            <Fragment key={e.id}>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3">{formatDate(e.date)}</td>
                <td className="py-1 pr-3">{LABELS[e.category]}</td>
                <td className="py-1 pr-3">{e.vendorName || '-'}</td>
                {isGeneral && (
                  <>
                    <td className="py-1 pr-3">{e.Project?.name || <span className="text-gray-400">{t('expenses.filters.noProject')}</span>}</td>
                    <td className="py-1 pr-3">{e.CashBox?.name || '-'}</td>
                  </>
                )}
                <td className="py-1 pr-3">
                  {(e.items?.length || e.taxes?.length || e.vendorNit || e.vendorPhone || e.vendorEmail || e.description) ? (
                    <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                      {expandedId === e.id ? t('expenses.hideDetail') : t('expenses.viewDetail', { count: e.items?.length || 0 })}
                    </button>
                  ) : '-'}
                </td>
                <td className="py-1 pr-3">{money(e.amount)}</td>
                <td className="py-1 pr-3 text-xs text-gray-500">
                  {t(`expenses.sources.${e.source}`, e.source === 'manual' ? 'Manual' : e.source)}
                </td>
                <td className="py-1 pr-3">{e.supportFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(e.supportFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
                <td className="py-1 pr-3">{e.paymentReceiptFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(e.paymentReceiptFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
                <td className="py-1 pr-3 text-right">
                  {e.source === 'manual' && (
                    <Can module="gastos" action="delete"><Button variant="danger" onClick={() => remove(e.id)}>{t('common.delete')}</Button></Can>
                  )}
                </td>
              </tr>
              {expandedId === e.id && (
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={isGeneral ? 11 : 9} className="py-3 px-3">
                    <div className="text-xs text-gray-500 mb-2 flex flex-wrap gap-x-4 gap-y-1">
                      {e.vendorNit && <span>{t('expenses.nit')}: {e.vendorNit}</span>}
                      {e.vendorPhone && <span>{t('expenses.phone')}: {e.vendorPhone}</span>}
                      {e.vendorEmail && <span>{t('expenses.email')}: {e.vendorEmail}</span>}
                      {e.description && <span>{t('expenses.notesLabel')}: {e.description}</span>}
                    </div>
                    {e.items?.length > 0 && (
                      <Table columns={[t('expenses.itemsTable.description'), t('expenses.itemsTable.quantity'), t('expenses.itemsTable.unitValue'), t('expenses.itemsTable.total')]}>
                        {e.items.map((it) => (
                          <tr key={it.id} className="border-b border-gray-100">
                            <td className="py-1 pr-3">{it.description}</td>
                            <td className="py-1 pr-3">{it.quantity}</td>
                            <td className="py-1 pr-3">{money(it.unitPrice)}</td>
                            <td className="py-1 pr-3">{money(it.totalPrice)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                    {e.taxes?.length > 0 && (
                      <Table columns={[t('expenses.taxesTable.tax'), t('expenses.taxesTable.rate'), t('expenses.taxesTable.value')]}>
                        {e.taxes.map((tx) => (
                          <tr key={tx.id} className="border-b border-gray-100">
                            <td className="py-1 pr-3">{tx.name}</td>
                            <td className="py-1 pr-3">{tx.rate != null ? `${tx.rate}%` : '-'}</td>
                            <td className="py-1 pr-3">{money(tx.amount)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {expenses.length === 0 && <tr><td colSpan={isGeneral ? 11 : 9} className="py-3 text-center text-gray-400">{t('expenses.empty')}</td></tr>}
        </Table>
      </Card>
    </div>
  );
}
