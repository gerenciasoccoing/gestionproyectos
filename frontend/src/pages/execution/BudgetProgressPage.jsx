import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { budgetApi, progressApi, apuApi } from '../../api';
import { Card, Button, Input, SearchSelect, Table, ErrorText, extractError, money } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

export default function BudgetProgressPage() {
  const { projectId } = useOutletContext();
  const [budget, setBudget] = useState(null);
  const [items, setItems] = useState([]);
  const [apus, setApus] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({ apuId: '', description: '', unit: '', quantity: '', unitCost: '' });
  const [aiuForm, setAiuForm] = useState({ adminPercent: '0', imprevistosPercent: '0', utilidadPercent: '0' });
  const [aiuSaved, setAiuSaved] = useState(false);
  const [error, setError] = useState('');

  const load = () => budgetApi.get(projectId).then((data) => {
    setBudget(data.budget);
    setItems(data.items);
    if (data.budget) {
      setAiuForm({
        adminPercent: String(data.budget.adminPercent),
        imprevistosPercent: String(data.budget.imprevistosPercent),
        utilidadPercent: String(data.budget.utilidadPercent),
      });
    }
  });
  useEffect(() => { load(); apuApi.list().then(setApus); }, [projectId]);

  const ensureBudget = async () => {
    if (budget) return budget;
    const created = await budgetApi.createVersion(projectId, 'inicial');
    setBudget(created);
    return created;
  };

  const submitAiu = async (e) => {
    e.preventDefault();
    setError(''); setAiuSaved(false);
    try {
      const b = await ensureBudget();
      await budgetApi.updateAiu(projectId, b.id, aiuForm);
      setAiuSaved(true);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const submitItem = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const b = await ensureBudget();
      const payload = { ...itemForm };
      if (!payload.apuId) delete payload.apuId;
      await budgetApi.addItem(projectId, b.id, payload);
      setItemForm({ apuId: '', description: '', unit: '', quantity: '', unitCost: '' });
      setShowItemForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const onApuChange = (apuId) => {
    const apu = apus.find((a) => a.id === apuId);
    setItemForm((f) => ({ ...f, apuId, unit: apu ? apu.unit : f.unit, unitCost: apu ? apu.unitCost.toFixed(2) : f.unitCost }));
  };

  return (
    <div>
      <Card title="AIU del presupuesto">
        <form onSubmit={submitAiu} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Input
            label="Administración (%)" type="number" min="0" step="0.01"
            value={aiuForm.adminPercent} onChange={(e) => setAiuForm({ ...aiuForm, adminPercent: e.target.value })}
          />
          <Input
            label="Imprevistos (%)" type="number" min="0" step="0.01"
            value={aiuForm.imprevistosPercent} onChange={(e) => setAiuForm({ ...aiuForm, imprevistosPercent: e.target.value })}
          />
          <Input
            label="Utilidad (%)" type="number" min="0" step="0.01"
            value={aiuForm.utilidadPercent} onChange={(e) => setAiuForm({ ...aiuForm, utilidadPercent: e.target.value })}
          />
          <Can module="ejecucion" action="edit">
            <div className="col-span-full flex items-center gap-3">
              <Button type="submit">Guardar AIU</Button>
              <p className="text-xs text-gray-400">Se aplica a los ítems basados en APU que agregues de aquí en adelante.</p>
              {aiuSaved && <p className="text-sm text-green-600">Guardado.</p>}
            </div>
          </Can>
        </form>
      </Card>

      <Card title="Ítems del presupuesto y avance físico" actions={
        <Can module="ejecucion" action="create">
          <Button onClick={() => setShowItemForm((s) => !s)}>{showItemForm ? 'Cancelar' : '+ Agregar ítem'}</Button>
        </Can>
      }>
        {showItemForm && (
          <form onSubmit={submitItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <SearchSelect
              label="APU (opcional)"
              options={apus.map((a) => ({ value: a.id, label: `${a.name} (${money(a.unitCost)}/${a.unit})` }))}
              value={itemForm.apuId}
              onChange={onApuChange}
              placeholder="-- Ítem manual (sin APU) --"
            />
            <Input label="Descripción" value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} required />
            <Input label="Unidad" value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} required />
            <Input label="Cantidad presupuestada" type="number" min="0" step="0.01" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} required />
            <Input label="Valor unitario" type="number" min="0" step="0.01" value={itemForm.unitCost} onChange={(e) => setItemForm({ ...itemForm, unitCost: e.target.value })} disabled={!!itemForm.apuId} required />
            <Button type="submit">Guardar ítem</Button>
            <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
          </form>
        )}

        <Table columns={['Descripción', 'Cant. Presup.', 'Ejecutado', '% Avance', 'Vr. Unit.', 'Vr. Total', 'Vr. Ejecutado', '']}>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">{it.description} <span className="text-gray-400">({it.unit})</span></td>
              <td className="py-2 pr-3">{Number(it.quantity)}</td>
              <td className="py-2 pr-3">{it.accumulatedQty}</td>
              <td className="py-2 pr-3">
                <div className="w-24 bg-gray-200 rounded h-2">
                  <div className={`h-2 rounded ${it.percent > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(it.percent, 100)}%` }} />
                </div>
                <span className="text-xs">{it.percent}%{it.percent > 100 ? ' ⚠' : ''}</span>
              </td>
              <td className="py-2 pr-3">{money(it.unitCost)}</td>
              <td className="py-2 pr-3">{money(it.totalCost)}</td>
              <td className="py-2 pr-3">{money(it.executedValue)}</td>
              <td className="py-2 pr-3 text-right">
                <Button variant="secondary" onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}>
                  {expandedId === it.id ? 'Cerrar' : 'Avance'}
                </Button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-gray-400">Sin ítems de presupuesto.</td></tr>}
        </Table>
      </Card>

      {expandedId && (
        <ItemProgressPanel projectId={projectId} itemId={expandedId} onChange={load} />
      )}
    </div>
  );
}

function ItemProgressPanel({ projectId, itemId, onChange }) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ date: '', quantityExecuted: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const load = () => progressApi.listEntries(projectId, itemId).then(setEntries);
  useEffect(() => { load(); }, [projectId, itemId]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setWarning('');
    try {
      const fd = new FormData();
      fd.append('date', form.date);
      fd.append('quantityExecuted', form.quantityExecuted);
      fd.append('notes', form.notes);
      [...files].forEach((f) => fd.append('photos', f));
      const res = await progressApi.createEntry(projectId, itemId, fd);
      if (res.warning) setWarning(res.warning);
      setForm({ date: '', quantityExecuted: '', notes: '' });
      setFiles([]);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (entryId) => {
    if (!confirm('¿Eliminar este registro de avance?')) return;
    await progressApi.removeEntry(projectId, itemId, entryId);
    load();
    onChange();
  };

  return (
    <Card title="Registros de avance">
      <Can module="ejecucion" action="create">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label="Cantidad ejecutada" type="number" min="0" step="0.01" value={form.quantityExecuted} onChange={(e) => setForm({ ...form, quantityExecuted: e.target.value })} required />
          <Input label="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Input label="Fotos" type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
          <Button type="submit" className="col-span-full">Registrar avance</Button>
          <div className="col-span-full">
            <ErrorText>{error}</ErrorText>
            {warning && <p className="text-sm text-yellow-600 mt-1">⚠ {warning}</p>}
          </div>
        </form>
      </Can>

      {entries.map((e) => (
        <div key={e.id} className="border-t border-gray-100 py-2 flex items-start justify-between">
          <div>
            <p className="text-sm"><strong>{e.date}</strong> — {Number(e.quantityExecuted)} unidades {e.notes && `— ${e.notes}`}</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {e.photos?.map((p) => (
                <a key={p.id} href={fileUrl(p.filePath)} target="_blank" rel="noreferrer">
                  <img src={fileUrl(p.filePath)} alt="avance" className="w-16 h-16 object-cover rounded border" />
                </a>
              ))}
            </div>
          </div>
          <Can module="ejecucion" action="delete">
            <Button variant="danger" onClick={() => remove(e.id)}>Eliminar</Button>
          </Can>
        </div>
      ))}
      {entries.length === 0 && <p className="text-gray-400 text-sm">Sin registros de avance para este ítem.</p>}
    </Card>
  );
}
