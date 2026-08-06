import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { expensesApi } from '../../api';
import { Card, Button, Input, Select, TextArea, Table, ErrorText, extractError, money } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
const LABELS = { mano_obra: 'Mano de obra', materiales: 'Materiales', equipos: 'Equipos', viaticos: 'Viáticos', imprevistos: 'Imprevistos' };
const emptyForm = { category: 'materiales', amount: '', date: '', description: '', vendorName: '', vendorNit: '', subtotal: '', taxAmount: '' };

export default function ExpensesPage() {
  const { projectId } = useOutletContext();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [budgetForm, setBudgetForm] = useState({ category: 'materiales', budgetedAmount: '' });
  const [error, setError] = useState('');

  const load = () => {
    expensesApi.list(projectId).then(setExpenses);
    expensesApi.summary(projectId).then(setSummary);
  };
  useEffect(() => { load(); }, [projectId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      await expensesApi.create(projectId, fd);
      setForm(emptyForm);
      setFile(null);
      setScanNotice('');
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
        description: result.itemsText || f.description,
        vendorName: result.vendorName || f.vendorName,
        vendorNit: result.vendorNit || f.vendorNit,
        subtotal: result.subtotal != null ? String(result.subtotal) : f.subtotal,
        taxAmount: result.taxAmount != null ? String(result.taxAmount) : f.taxAmount,
      }));
      setScanNotice('Lectura automática completada (local, sin IA externa) — revisa y corrige los datos antes de guardar.');
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

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
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Registrar gasto'}</Button>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Select label="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{LABELS[c]}</option>)}
              </Select>
              <Input label="Valor total" type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              <Input label="Proveedor" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
              <Input label="NIT proveedor" value={form.vendorNit} onChange={(e) => setForm({ ...form, vendorNit: e.target.value })} />
              <Input label="Subtotal (antes de impuestos)" type="number" min="0" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} />
              <Input label="Impuestos (IVA, etc.)" type="number" min="0" value={form.taxAmount} onChange={(e) => setForm({ ...form, taxAmount: e.target.value })} />
              <TextArea label="Descripción / ítems" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-full" rows={4} />
              <Button type="submit" className="col-span-full">Guardar gasto</Button>
              <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
            </div>
          </form>
        )}
        <Table columns={['Fecha', 'Categoría', 'Proveedor', 'Descripción', 'Valor', 'Origen', 'Soporte', '']}>
          {expenses.map((e) => (
            <tr key={e.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{e.date}</td>
              <td className="py-1 pr-3">{LABELS[e.category]}</td>
              <td className="py-1 pr-3">{e.vendorName || '-'}</td>
              <td className="py-1 pr-3 max-w-xs truncate" title={e.description}>{e.description || '-'}</td>
              <td className="py-1 pr-3">{money(e.amount)}</td>
              <td className="py-1 pr-3 text-xs text-gray-500">{e.source === 'manual' ? 'Manual' : e.source === 'purchase_receipt' ? 'Compra' : 'Liquidación'}</td>
              <td className="py-1 pr-3">{e.supportFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(e.supportFilePath)} target="_blank" rel="noreferrer">Ver</a> : '-'}</td>
              <td className="py-1 pr-3 text-right">
                {e.source === 'manual' && (
                  <Can module="gastos" action="delete"><Button variant="danger" onClick={() => remove(e.id)}>Eliminar</Button></Can>
                )}
              </td>
            </tr>
          ))}
          {expenses.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-gray-400">Sin gastos registrados.</td></tr>}
        </Table>
      </Card>
    </div>
  );
}
