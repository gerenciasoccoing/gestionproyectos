import { useEffect, useState } from 'react';
import { apuApi, priceItemsApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';

export default function ApuPage() {
  const [apus, setApus] = useState([]);
  const [priceItems, setPriceItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', unit: '', aiuPercent: '0', otherCosts: '0' });
  const [components, setComponents] = useState([{ priceItemId: '', yield: '' }]);
  const [error, setError] = useState('');

  const load = () => apuApi.list().then(setApus);
  useEffect(() => { load(); priceItemsApi.list().then(setPriceItems); }, []);

  const addRow = () => setComponents((c) => [...c, { priceItemId: '', yield: '' }]);
  const updateRow = (idx, field, value) => setComponents((c) => {
    const next = [...c]; next[idx] = { ...next[idx], [field]: value }; return next;
  });
  const removeRow = (idx) => setComponents((c) => c.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apuApi.create({ ...form, components: components.filter((c) => c.priceItemId) });
      setForm({ name: '', unit: '', aiuPercent: '0', otherCosts: '0' });
      setComponents([{ priceItemId: '', yield: '' }]);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este APU?')) return;
    await apuApi.remove(id);
    load();
  };

  return (
    <Card title="Análisis de Precios Unitarios (APU)" actions={
      <Can module="cotizaciones" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Nuevo APU'}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <Input label="Nombre del ítem/actividad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Unidad" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            <Input label="AIU (%)" type="number" min="0" value={form.aiuPercent} onChange={(e) => setForm({ ...form, aiuPercent: e.target.value })} required />
            <Input label="Otros costos directos (ej. herramienta menor)" type="number" min="0" value={form.otherCosts} onChange={(e) => setForm({ ...form, otherCosts: e.target.value })} />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-2">Componentes (materiales, mano de obra, equipo)</p>
          {components.map((c, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2 items-end">
              <Select label="Insumo (base de precios)" value={c.priceItemId} onChange={(e) => updateRow(idx, 'priceItemId', e.target.value)} className="col-span-full">
                <option value="">-- seleccionar --</option>
                {priceItems.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.currentValue)}/{p.unit})</option>)}
              </Select>
              <Input label="Rendimiento/Cantidad" type="number" min="0" step="0.0001" value={c.yield} onChange={(e) => updateRow(idx, 'yield', e.target.value)} />
              <Button type="button" variant="danger" onClick={() => removeRow(idx)}>Quitar</Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={addRow}>+ Agregar componente</Button>
          <Button type="submit" className="ml-2">Guardar APU</Button>
          <ErrorText>{error}</ErrorText>
        </form>
      )}
      <Table columns={['Código', 'Nombre', 'Unidad', 'AIU %', 'Otros costos', 'Costo directo', 'Costo unitario total', '']}>
        {apus.map((a) => (
          <tr key={a.id} className="border-b border-gray-100">
            <td className="py-1 pr-3 text-gray-400">{a.code || '-'}</td>
            <td className="py-1 pr-3">{a.name}</td>
            <td className="py-1 pr-3">{a.unit}</td>
            <td className="py-1 pr-3">{Number(a.aiuPercent)}%</td>
            <td className="py-1 pr-3">{money(a.otherCosts)}</td>
            <td className="py-1 pr-3">{money(a.directCost)}</td>
            <td className="py-1 pr-3 font-semibold">{money(a.unitCost)}</td>
            <td className="py-1 pr-3 text-right flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                {expandedId === a.id ? 'Cerrar' : 'Componentes'}
              </Button>
              <Can module="cotizaciones" action="delete"><Button variant="danger" onClick={() => remove(a.id)}>Eliminar</Button></Can>
            </td>
          </tr>
        ))}
        {apus.length === 0 && <tr><td colSpan={8} className="py-2 text-center text-gray-400">Sin APU registrados.</td></tr>}
      </Table>

      {expandedId && <ApuComponents apu={apus.find((a) => a.id === expandedId)} onChange={load} />}
    </Card>
  );
}

function ApuComponents({ apu, onChange }) {
  if (!apu) return null;
  return (
    <div className="mt-3 border-t pt-3">
      <p className="font-medium text-sm mb-2">Componentes de: {apu.name}</p>
      <Table columns={['Insumo', 'Tipo', 'Rendimiento', 'Valor unitario', 'Subtotal']}>
        {apu.components.map((c) => (
          <tr key={c.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{c.priceItem.name}</td>
            <td className="py-1 pr-3">{c.priceItem.type}</td>
            <td className="py-1 pr-3">{Number(c.yield)}</td>
            <td className="py-1 pr-3">{money(c.priceItem.currentValue)}</td>
            <td className="py-1 pr-3">{money(Number(c.yield) * Number(c.priceItem.currentValue))}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
