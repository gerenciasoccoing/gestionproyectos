import { useEffect, useMemo, useState } from 'react';
import { apuApi, priceItemsApi, companyApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';

const SECTION_DEFS = [
  { category: 'material', title: 'Materiales' },
  { category: 'herramienta', title: 'Herramientas y Equipos' },
  { category: 'personal', title: 'Mano de Obra (Personal)' },
  { category: 'transporte', title: 'Transporte' },
];

function emptyRow(category, defaultPrestacionalPercent) {
  if (category === 'personal') {
    return { priceItemId: '', quantity: '1', yield: '1', prestacionalPercent: String(defaultPrestacionalPercent) };
  }
  if (category === 'herramienta') {
    return { priceItemId: '', quantity: '1', yield: '1' };
  }
  if (category === 'transporte') {
    return { priceItemId: '', description: '', transportMode: 'distancia_peso', quantity: '', transportDistance: '', unitValue: '', transportPercent: '' };
  }
  return { priceItemId: '', quantity: '1' }; // material
}

const emptyForm = { name: '', unit: '', code: '', aiuPercent: '0', otherCosts: '0' };

export default function ApuPage() {
  const [apus, setApus] = useState([]);
  const [priceItems, setPriceItems] = useState([]);
  const [defaultPrestacionalPercent, setDefaultPrestacionalPercent] = useState(70);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [sections, setSections] = useState({ material: [], herramienta: [], personal: [], transporte: [] });
  const [collapsed, setCollapsed] = useState({ material: false, herramienta: false, personal: false, transporte: false });
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState('');

  const load = () => apuApi.list().then(setApus);
  useEffect(() => {
    load();
    priceItemsApi.list().then(setPriceItems);
    companyApi.get().then((s) => setDefaultPrestacionalPercent(Number(s.defaultPrestacionalPercent ?? 70)));
  }, []);

  const priceItemsByType = (type) => priceItems.filter((p) => p.type === type);
  const priceById = (id) => priceItems.find((p) => p.id === id);

  const resetForm = () => {
    setForm(emptyForm);
    setSections({ material: [], herramienta: [], personal: [], transporte: [] });
    setEditingId(null);
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = async (apu) => {
    setError('');
    const full = await apuApi.get(apu.id);
    setForm({
      name: full.name,
      unit: full.unit,
      code: full.code || '',
      aiuPercent: String(full.aiuPercent),
      otherCosts: String(full.otherCosts ?? 0),
    });
    const next = { material: [], herramienta: [], personal: [], transporte: [] };
    (full.components || []).forEach((c) => {
      if (c.category === 'material') {
        next.material.push({ priceItemId: c.priceItemId, quantity: String(c.quantity) });
      } else if (c.category === 'herramienta') {
        next.herramienta.push({ priceItemId: c.priceItemId, quantity: String(c.quantity), yield: String(c.yield ?? 1) });
      } else if (c.category === 'personal') {
        next.personal.push({
          priceItemId: c.priceItemId,
          quantity: String(c.quantity),
          yield: String(c.yield ?? 1),
          prestacionalPercent: String(c.prestacionalPercent ?? defaultPrestacionalPercent),
        });
      } else if (c.category === 'transporte') {
        next.transporte.push({
          priceItemId: c.priceItemId || '',
          description: c.description || '',
          transportMode: c.transportMode || 'distancia_peso',
          quantity: c.quantity !== undefined ? String(c.quantity) : '',
          transportDistance: c.transportDistance !== undefined && c.transportDistance !== null ? String(c.transportDistance) : '',
          unitValue: c.unitValue !== undefined && c.unitValue !== null ? String(c.unitValue) : '',
          transportPercent: c.transportPercent !== undefined && c.transportPercent !== null ? String(c.transportPercent) : '',
        });
      }
    });
    setSections(next);
    setEditingId(apu.id);
    setShowForm(true);
  };

  const addRow = (category) => setSections((s) => ({ ...s, [category]: [...s[category], emptyRow(category, defaultPrestacionalPercent)] }));
  const updateRow = (category, idx, field, value) => setSections((s) => {
    const rows = [...s[category]];
    let row = { ...rows[idx], [field]: value };
    if (category === 'personal' && field === 'priceItemId' && !rows[idx].priceItemId) {
      // Al seleccionar por primera vez, autocompleta el factor prestacional por defecto.
      row.prestacionalPercent = String(defaultPrestacionalPercent);
    }
    rows[idx] = row;
    return { ...s, [category]: rows };
  });
  const removeRow = (category, idx) => setSections((s) => ({ ...s, [category]: s[category].filter((_, i) => i !== idx) }));

  // Subtotales calculados en tiempo real, con la misma fórmula que el backend (budgetService.computeSectionCosts).
  const materialsSubtotal = useMemo(
    () => sections.material.reduce((sum, r) => sum + (Number(r.quantity) || 0) * Number(priceById(r.priceItemId)?.currentValue || 0), 0),
    [sections.material, priceItems]
  );
  const herramientasSubtotal = useMemo(
    () => sections.herramienta.reduce(
      (sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.yield) || 1) * Number(priceById(r.priceItemId)?.currentValue || 0),
      0
    ),
    [sections.herramienta, priceItems]
  );
  const personalSubtotal = useMemo(
    () => sections.personal.reduce((sum, r) => {
      const base = Number(priceById(r.priceItemId)?.currentValue || 0);
      const conPrestacional = base * (1 + (Number(r.prestacionalPercent) || 0) / 100);
      const rend = Number(r.yield) || 1;
      return sum + ((Number(r.quantity) || 0) * conPrestacional) / rend;
    }, 0),
    [sections.personal, priceItems]
  );
  const transporteSubtotal = useMemo(
    () => sections.transporte.reduce((sum, r) => {
      if (r.transportMode === 'porcentaje_materiales') {
        return sum + materialsSubtotal * ((Number(r.transportPercent) || 0) / 100);
      }
      const tarifa = r.priceItemId ? Number(priceById(r.priceItemId)?.currentValue || 0) : (Number(r.unitValue) || 0);
      return sum + (Number(r.quantity) || 0) * (Number(r.transportDistance) || 0) * tarifa;
    }, 0),
    [sections.transporte, priceItems, materialsSubtotal]
  );
  const totalDirectCost = materialsSubtotal + herramientasSubtotal + personalSubtotal + transporteSubtotal + (Number(form.otherCosts) || 0);

  const buildComponentsPayload = () => {
    const out = [];
    sections.material.forEach((r) => { if (r.priceItemId) out.push({ category: 'material', priceItemId: r.priceItemId, quantity: r.quantity || 0 }); });
    sections.herramienta.forEach((r) => { if (r.priceItemId) out.push({ category: 'herramienta', priceItemId: r.priceItemId, quantity: r.quantity || 0, yield: r.yield || 1 }); });
    sections.personal.forEach((r) => { if (r.priceItemId) out.push({ category: 'personal', priceItemId: r.priceItemId, quantity: r.quantity || 0, yield: r.yield || 1, prestacionalPercent: r.prestacionalPercent || 0 }); });
    sections.transporte.forEach((r) => {
      if (!r.priceItemId && !r.description) return;
      const base = { category: 'transporte', priceItemId: r.priceItemId || null, description: r.description || null, transportMode: r.transportMode };
      if (r.transportMode === 'porcentaje_materiales') {
        out.push({ ...base, transportPercent: r.transportPercent || 0 });
      } else {
        out.push({ ...base, quantity: r.quantity || 0, transportDistance: r.transportDistance || 0, unitValue: r.unitValue || null });
      }
    });
    return out;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, components: buildComponentsPayload() };
      if (editingId) await apuApi.update(editingId, payload);
      else await apuApi.create(payload);
      resetForm();
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
        <Button onClick={() => (showForm ? (setShowForm(false), resetForm()) : startCreate())}>
          {showForm ? 'Cancelar' : '+ Nuevo APU'}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Input label="Nombre del ítem/actividad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Unidad" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            <Input label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input label="AIU (%)" type="number" min="0" value={form.aiuPercent} onChange={(e) => setForm({ ...form, aiuPercent: e.target.value })} required />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ApuSection
              def={SECTION_DEFS[0]}
              rows={sections.material}
              options={priceItemsByType('material')}
              subtotal={materialsSubtotal}
              collapsed={collapsed.material}
              onToggle={() => setCollapsed((c) => ({ ...c, material: !c.material }))}
              onAdd={() => addRow('material')}
              onUpdate={(idx, field, val) => updateRow('material', idx, field, val)}
              onRemove={(idx) => removeRow('material', idx)}
            />
            <ApuSection
              def={SECTION_DEFS[2]}
              rows={sections.personal}
              options={priceItemsByType('mano_obra')}
              subtotal={personalSubtotal}
              collapsed={collapsed.personal}
              onToggle={() => setCollapsed((c) => ({ ...c, personal: !c.personal }))}
              onAdd={() => addRow('personal')}
              onUpdate={(idx, field, val) => updateRow('personal', idx, field, val)}
              onRemove={(idx) => removeRow('personal', idx)}
            />
            <ApuSection
              def={SECTION_DEFS[1]}
              rows={sections.herramienta}
              options={priceItemsByType('equipo')}
              subtotal={herramientasSubtotal}
              collapsed={collapsed.herramienta}
              onToggle={() => setCollapsed((c) => ({ ...c, herramienta: !c.herramienta }))}
              onAdd={() => addRow('herramienta')}
              onUpdate={(idx, field, val) => updateRow('herramienta', idx, field, val)}
              onRemove={(idx) => removeRow('herramienta', idx)}
            />
            <ApuSection
              def={SECTION_DEFS[3]}
              rows={sections.transporte}
              options={priceItems}
              subtotal={transporteSubtotal}
              collapsed={collapsed.transporte}
              onToggle={() => setCollapsed((c) => ({ ...c, transporte: !c.transporte }))}
              onAdd={() => addRow('transporte')}
              onUpdate={(idx, field, val) => updateRow('transporte', idx, field, val)}
              onRemove={(idx) => removeRow('transporte', idx)}
            />
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-t pt-3">
            <Input
              label="Otros costos directos (opcional)"
              type="number" min="0"
              value={form.otherCosts}
              onChange={(e) => setForm({ ...form, otherCosts: e.target.value })}
              className="max-w-xs"
            />
            <p className="text-lg font-semibold text-gray-800">TOTAL COSTO DIRECTO: {money(totalDirectCost)}</p>
          </div>

          <div className="mt-3">
            <Button type="submit">{editingId ? 'Guardar cambios' : 'Guardar APU'}</Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      )}

      <Table columns={['Código', 'Nombre', 'Unidad', 'AIU %', 'Costo directo', 'Costo unitario total', '']}>
        {apus.map((a) => (
          <tr key={a.id} className="border-b border-gray-100">
            <td className="py-1 pr-3 text-gray-400">{a.code || '-'}</td>
            <td className="py-1 pr-3">{a.name}</td>
            <td className="py-1 pr-3">{a.unit}</td>
            <td className="py-1 pr-3">{Number(a.aiuPercent)}%</td>
            <td className="py-1 pr-3">{money(a.directCost)}</td>
            <td className="py-1 pr-3 font-semibold">{money(a.unitCost)}</td>
            <td className="py-1 pr-3 text-right flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                {expandedId === a.id ? 'Cerrar' : 'Componentes'}
              </Button>
              <Can module="cotizaciones" action="edit"><Button variant="secondary" onClick={() => startEdit(a)}>Editar</Button></Can>
              <Can module="cotizaciones" action="delete"><Button variant="danger" onClick={() => remove(a.id)}>Eliminar</Button></Can>
            </td>
          </tr>
        ))}
        {apus.length === 0 && <tr><td colSpan={7} className="py-2 text-center text-gray-400">Sin APU registrados.</td></tr>}
      </Table>

      {expandedId && <ApuComponents apu={apus.find((a) => a.id === expandedId)} />}
    </Card>
  );
}

function ApuSection({ def, rows, options, subtotal, collapsed, onToggle, onAdd, onUpdate, onRemove }) {
  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-lg">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 font-medium text-gray-800 text-sm">
          <span className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}>▾</span>
          {def.title}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Total: {money(subtotal)}</span>
          <Button type="button" variant="primary" className="!rounded-full !w-7 !h-7 !p-0 flex items-center justify-center" onClick={onAdd}>+</Button>
        </div>
      </div>
      {!collapsed && (
        <div className="p-3 space-y-2">
          {rows.length === 0 && <p className="text-xs text-gray-400">Sin ítems. Usa "+" para agregar.</p>}
          {rows.map((row, idx) => (
            <SectionRow
              key={idx}
              category={def.category}
              row={row}
              options={options}
              onChange={(field, val) => onUpdate(idx, field, val)}
              onRemove={() => onRemove(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionRow({ category, row, options, onChange, onRemove }) {
  const selected = options.find((p) => p.id === row.priceItemId);

  if (category === 'material') {
    return (
      <div className="grid grid-cols-12 gap-2 items-end">
        <Select label="Material" className="col-span-6" value={row.priceItemId} onChange={(e) => onChange('priceItemId', e.target.value)}>
          <option value="">-- seleccionar --</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.currentValue)}/{p.unit})</option>)}
        </Select>
        <Input label="Cantidad" className="col-span-3" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
        <div className="col-span-2 text-sm text-gray-600 pb-1.5">{money((Number(row.quantity) || 0) * Number(selected?.currentValue || 0))}</div>
        <Button type="button" variant="danger" className="col-span-1" onClick={onRemove}>×</Button>
      </div>
    );
  }

  if (category === 'herramienta') {
    const total = (Number(row.quantity) || 0) * (Number(row.yield) || 1) * Number(selected?.currentValue || 0);
    return (
      <div className="grid grid-cols-12 gap-2 items-end">
        <Select label="Herramienta/Equipo" className="col-span-5" value={row.priceItemId} onChange={(e) => onChange('priceItemId', e.target.value)}>
          <option value="">-- seleccionar --</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.currentValue)}/{p.unit})</option>)}
        </Select>
        <Input label="Cantidad" className="col-span-2" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
        <Input label="Rendimiento" className="col-span-2" type="number" min="0" step="0.0001" value={row.yield} onChange={(e) => onChange('yield', e.target.value)} />
        <div className="col-span-2 text-sm text-gray-600 pb-1.5">{money(total)}</div>
        <Button type="button" variant="danger" className="col-span-1" onClick={onRemove}>×</Button>
      </div>
    );
  }

  if (category === 'personal') {
    const base = Number(selected?.currentValue || 0);
    const total = ((Number(row.quantity) || 0) * base * (1 + (Number(row.prestacionalPercent) || 0) / 100)) / (Number(row.yield) || 1);
    return (
      <div className="grid grid-cols-12 gap-2 items-end">
        <Select label="Personal" className="col-span-4" value={row.priceItemId} onChange={(e) => onChange('priceItemId', e.target.value)}>
          <option value="">-- seleccionar --</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.currentValue)}/{p.unit})</option>)}
        </Select>
        <Input label="Cantidad" className="col-span-2" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
        <Input label="Rendimiento" className="col-span-2" type="number" min="0" step="0.0001" value={row.yield} onChange={(e) => onChange('yield', e.target.value)} />
        <Input label="Valor base" className="col-span-2" value={money(base)} readOnly disabled />
        <Input label="% Prestacional" className="col-span-1" type="number" min="0" step="0.01" value={row.prestacionalPercent} onChange={(e) => onChange('prestacionalPercent', e.target.value)} />
        <Button type="button" variant="danger" className="col-span-1" onClick={onRemove}>×</Button>
        <div className="col-span-full text-right text-sm text-gray-600 -mt-1">Valor ítem (con prestaciones): {money(total)}</div>
      </div>
    );
  }

  // transporte
  const rate = row.priceItemId ? Number(selected?.currentValue || 0) : (Number(row.unitValue) || 0);
  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <Select label="Modalidad" className="col-span-3" value={row.transportMode} onChange={(e) => onChange('transportMode', e.target.value)}>
        <option value="distancia_peso">Distancia y peso</option>
        <option value="porcentaje_materiales">% sobre materiales</option>
      </Select>
      <Select label="Insumo (opcional)" className="col-span-4" value={row.priceItemId} onChange={(e) => onChange('priceItemId', e.target.value)}>
        <option value="">-- manual --</option>
        {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.currentValue)}/{p.unit})</option>)}
      </Select>
      {!row.priceItemId && (
        <Input label="Descripción" className="col-span-4" value={row.description} onChange={(e) => onChange('description', e.target.value)} />
      )}
      {row.transportMode === 'distancia_peso' ? (
        <>
          <Input label="Peso (kg)" className="col-span-2" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
          <Input label="Distancia (km)" className="col-span-2" type="number" min="0" step="0.0001" value={row.transportDistance} onChange={(e) => onChange('transportDistance', e.target.value)} />
          {!row.priceItemId && (
            <Input label="Valor por kg-km" className="col-span-2" type="number" min="0" step="0.0001" value={row.unitValue} onChange={(e) => onChange('unitValue', e.target.value)} />
          )}
        </>
      ) : (
        <Input label="% sobre materiales" className="col-span-2" type="number" min="0" step="0.01" value={row.transportPercent} onChange={(e) => onChange('transportPercent', e.target.value)} />
      )}
      <Button type="button" variant="danger" className="col-span-1" onClick={onRemove}>×</Button>
      {row.transportMode === 'distancia_peso' && (
        <div className="col-span-full text-right text-sm text-gray-600 -mt-1">
          Valor total: {money((Number(row.quantity) || 0) * (Number(row.transportDistance) || 0) * rate)}
        </div>
      )}
    </div>
  );
}

function ApuComponents({ apu }) {
  if (!apu) return null;
  const label = (c) => {
    if (c.priceItem) return c.priceItem.name;
    return c.description || '(sin descripción)';
  };
  const categoryLabel = { material: 'Material', herramienta: 'Herramienta/Equipo', personal: 'Personal', transporte: 'Transporte' };
  return (
    <div className="mt-3 border-t pt-3">
      <p className="font-medium text-sm mb-2">Componentes de: {apu.name}</p>
      <Table columns={['Insumo', 'Sección', 'Cantidad', 'Rendimiento', 'Valor unitario']}>
        {apu.components.map((c) => (
          <tr key={c.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{label(c)}</td>
            <td className="py-1 pr-3">{categoryLabel[c.category] || c.category}</td>
            <td className="py-1 pr-3">{Number(c.quantity)}</td>
            <td className="py-1 pr-3">{c.yield !== null && c.yield !== undefined ? Number(c.yield) : '-'}</td>
            <td className="py-1 pr-3">{money(c.priceItem ? c.priceItem.currentValue : c.unitValue)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
