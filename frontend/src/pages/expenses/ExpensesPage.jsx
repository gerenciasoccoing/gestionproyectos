import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { expensesApi } from '../../api';
import { Card, Button, Input, Select, TextArea, Table, ErrorText, extractError, money } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
const LABELS = { mano_obra: 'Mano de obra', materiales: 'Materiales', equipos: 'Equipos', viaticos: 'Viáticos', imprevistos: 'Imprevistos' };
const emptyForm = { category: 'materiales', amount: '', date: '', description: '', vendorName: '', vendorNit: '', vendorPhone: '', vendorEmail: '' };
const emptyItem = { description: '', quantity: '1', unitPrice: '', totalPrice: '' };
const emptyTax = { name: '', rate: '', amount: '' };
const TAX_NAME_SUGGESTIONS = ['IVA', 'ReteIVA', 'ReteICA', 'ICA', 'Retención en la fuente', 'Impoconsumo'];

function sum(list, field) {
  return list.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

export default function ExpensesPage() {
  const { projectId } = useOutletContext();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [budgetForm, setBudgetForm] = useState({ category: 'materiales', budgetedAmount: '' });
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => {
    expensesApi.list(projectId).then(setExpenses);
    expensesApi.summary(projectId).then(setSummary);
  };
  useEffect(() => { load(); }, [projectId]);

  const itemsSubtotal = sum(items, 'totalPrice');
  const taxesTotal = sum(taxes, 'amount');

  const resetForm = () => {
    setForm(emptyForm);
    setItems([]);
    setTaxes([]);
    setFile(null);
    setScanNotice('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('subtotal', itemsSubtotal || '');
      fd.append('taxAmount', taxesTotal || '');
      fd.append('items', JSON.stringify(items.filter((it) => it.description.trim())));
      fd.append('taxes', JSON.stringify(taxes.filter((t) => t.name.trim())));
      if (file) fd.append('file', file);
      await expensesApi.create(projectId, fd);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const scanFile = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    setScanNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await expensesApi.scan(projectId, fd);
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
        setTaxes(result.taxes.map((t) => ({
          name: t.name || '',
          rate: t.rate != null ? String(t.rate) : '',
          amount: t.amount != null ? String(t.amount) : '',
        })));
      }
      setScanNotice('Lectura automática completada (local, sin IA externa) — revisa y corrige los datos antes de guardar.');
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
    setTaxes((list) => list.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
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
    if (!confirm('¿Eliminar este gasto?')) return;
    await expensesApi.remove(projectId, id);
    load();
  };

  return (
    <div>
      {summary && (
        <Card title="Presupuesto vs. Gasto Acumulado vs. Saldo Disponible">
          <Table columns={['Categoría', 'Presupuestado', 'Gastado', 'Disponible']}>
            {summary.rows.map((r) => (
              <tr key={r.category} className="border-b border-gray-100">
                <td className="py-1 pr-3">{LABELS[r.category]}</td>
                <td className="py-1 pr-3">{money(r.budgetedAmount)}</td>
                <td className="py-1 pr-3">{money(r.spent)}</td>
                <td className={`py-1 pr-3 ${r.available < 0 ? 'text-red-600 font-semibold' : ''}`}>{money(r.available)}</td>
              </tr>
            ))}
          </Table>
          <p className="text-sm font-semibold mt-2">Total: {money(summary.totals.budgetedAmount)} presupuestado / {money(summary.totals.spent)} gastado</p>
          <Can module="gastos" action="edit">
            <form onSubmit={submitBudget} className="flex flex-wrap gap-2 items-end mt-3 border-t pt-3">
              <Select label="Categoría" value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
              </Select>
              <Input label="Valor presupuestado" type="number" min="0" value={budgetForm.budgetedAmount} onChange={(e) => setBudgetForm({ ...budgetForm, budgetedAmount: e.target.value })} required />
              <Button type="submit">Fijar presupuesto</Button>
            </form>
          </Can>
        </Card>
      )}

      <Card title="Gastos registrados" actions={
        <Can module="gastos" action="create">
          <Button onClick={() => { setShowForm((s) => !s); if (showForm) resetForm(); }}>{showForm ? 'Cancelar' : '+ Registrar gasto'}</Button>
        </Can>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 items-end">
              <Input
                label="Factura o soporte (PDF, JPG, PNG)"
                type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => { setFile(e.target.files[0]); setScanNotice(''); }}
              />
              <Button type="button" variant="secondary" disabled={!file || scanning} onClick={scanFile}>
                {scanning ? 'Leyendo factura… puede tardar unos segundos' : 'Leer factura automáticamente'}
              </Button>
            </div>
            {scanNotice && <p className="text-sm text-green-700 mb-3">{scanNotice}</p>}
            <p className="text-xs text-gray-400 mb-3">
              La lectura automática es local (OCR + reglas de texto, sin IA externa): úsala como apoyo, no reemplaza revisar la factura.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Select label="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
              </Select>
              <Input label="Valor total" type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              <Input label="Proveedor" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
              <Input label="NIT proveedor" value={form.vendorNit} onChange={(e) => setForm({ ...form, vendorNit: e.target.value })} />
              <Input label="Teléfono proveedor" value={form.vendorPhone} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} />
              <Input label="Correo proveedor" type="email" value={form.vendorEmail} onChange={(e) => setForm({ ...form, vendorEmail: e.target.value })} />
              <TextArea label="Notas adicionales" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-full" rows={2} />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-gray-700">Ítems de la factura</h4>
                <Button type="button" variant="secondary" onClick={addItem}>+ Agregar ítem</Button>
              </div>
              <Table columns={['Descripción', 'Cantidad', 'Valor unitario', 'Valor total', '']}>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1 pr-2"><Input value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-28"><Input type="number" min="0" step="any" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-36"><Input type="number" min="0" value={it.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-36"><Input type="number" min="0" value={it.totalPrice} onChange={(e) => updateItem(idx, 'totalPrice', e.target.value)} /></td>
                    <td className="py-1 text-right"><Button type="button" variant="danger" onClick={() => removeItem(idx)}>Quitar</Button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-gray-400 text-sm">Sin ítems agregados.</td></tr>}
              </Table>
              {items.length > 0 && <p className="text-sm text-gray-600 mt-1 text-right">Subtotal ítems: {money(itemsSubtotal)}</p>}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-gray-700">Impuestos de la factura</h4>
                <Button type="button" variant="secondary" onClick={addTax}>+ Agregar impuesto</Button>
              </div>
              <datalist id="tax-name-suggestions">
                {TAX_NAME_SUGGESTIONS.map((n) => <option key={n} value={n} />)}
              </datalist>
              <Table columns={['Impuesto', 'Tarifa (%)', 'Valor', '']}>
                {taxes.map((t, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1 pr-2"><Input list="tax-name-suggestions" value={t.name} onChange={(e) => updateTax(idx, 'name', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-28"><Input type="number" min="0" step="any" value={t.rate} onChange={(e) => updateTax(idx, 'rate', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-36"><Input type="number" min="0" value={t.amount} onChange={(e) => updateTax(idx, 'amount', e.target.value)} /></td>
                    <td className="py-1 text-right"><Button type="button" variant="danger" onClick={() => removeTax(idx)}>Quitar</Button></td>
                  </tr>
                ))}
                {taxes.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-gray-400 text-sm">Sin impuestos agregados.</td></tr>}
              </Table>
              {taxes.length > 0 && <p className="text-sm text-gray-600 mt-1 text-right">Total impuestos: {money(taxesTotal)}</p>}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button type="submit">Guardar gasto</Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        )}
        <Table columns={['Fecha', 'Categoría', 'Proveedor', 'Ítems', 'Valor', 'Origen', 'Soporte', '']}>
          {expenses.map((e) => (
            <Fragment key={e.id}>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3">{e.date}</td>
                <td className="py-1 pr-3">{LABELS[e.category]}</td>
                <td className="py-1 pr-3">{e.vendorName || '-'}</td>
                <td className="py-1 pr-3">
                  {(e.items?.length || e.taxes?.length) ? (
                    <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                      {expandedId === e.id ? 'Ocultar detalle' : `Ver detalle (${e.items?.length || 0})`}
                    </button>
                  ) : (e.description || '-')}
                </td>
                <td className="py-1 pr-3">{money(e.amount)}</td>
                <td className="py-1 pr-3 text-xs text-gray-500">{e.source === 'manual' ? 'Manual' : e.source === 'purchase_receipt' ? 'Compra' : 'Liquidación'}</td>
                <td className="py-1 pr-3">{e.supportFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(e.supportFilePath)} target="_blank" rel="noreferrer">Ver</a> : '-'}</td>
                <td className="py-1 pr-3 text-right">
                  {e.source === 'manual' && (
                    <Can module="gastos" action="delete"><Button variant="danger" onClick={() => remove(e.id)}>Eliminar</Button></Can>
                  )}
                </td>
              </tr>
              {expandedId === e.id && (
                <tr className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={8} className="py-3 px-3">
                    <div className="text-xs text-gray-500 mb-2 flex flex-wrap gap-x-4 gap-y-1">
                      {e.vendorNit && <span>NIT: {e.vendorNit}</span>}
                      {e.vendorPhone && <span>Tel: {e.vendorPhone}</span>}
                      {e.vendorEmail && <span>Correo: {e.vendorEmail}</span>}
                      {e.description && <span>Notas: {e.description}</span>}
                    </div>
                    {e.items?.length > 0 && (
                      <Table columns={['Descripción', 'Cantidad', 'Valor unitario', 'Valor total']}>
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
                      <Table columns={['Impuesto', 'Tarifa (%)', 'Valor']}>
                        {e.taxes.map((t) => (
                          <tr key={t.id} className="border-b border-gray-100">
                            <td className="py-1 pr-3">{t.name}</td>
                            <td className="py-1 pr-3">{t.rate != null ? `${t.rate}%` : '-'}</td>
                            <td className="py-1 pr-3">{money(t.amount)}</td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {expenses.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-gray-400">Sin gastos registrados.</td></tr>}
        </Table>
      </Card>
    </div>
  );
}
