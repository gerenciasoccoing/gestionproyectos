import { useEffect, useState } from 'react';
import { priceItemsApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';

const TYPE_LABELS = { material: 'Material', mano_obra: 'Mano de obra', equipo: 'Equipo/Maquinaria' };

export default function PriceBookPage() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'material', name: '', unit: '', currentValue: '' });
  const [error, setError] = useState('');
  const [editing, setEditing] = useState({});

  const load = () => priceItemsApi.list().then(setItems);
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await priceItemsApi.create(form);
      setForm({ type: 'material', name: '', unit: '', currentValue: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const updateValue = async (id) => {
    const value = editing[id];
    if (value === undefined || value === '') return;
    await priceItemsApi.updateValue(id, { currentValue: value, effectiveDate: new Date().toISOString().slice(0, 10) });
    setEditing((e) => ({ ...e, [id]: undefined }));
    load();
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este ítem de precio?')) return;
    await priceItemsApi.remove(id);
    load();
  };

  return (
    <div>
      <Can module="cotizaciones" action="create">
        <ImportSection onImported={load} />
      </Can>

      <Card title="Base de Precios (Global)" actions={
        <Can module="cotizaciones" action="create">
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar ítem'}</Button>
        </Can>
      }>
        {showForm && (
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="material">Material</option>
              <option value="mano_obra">Mano de obra</option>
              <option value="equipo">Equipo/Maquinaria</option>
            </Select>
            <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Unidad" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            <Input label="Valor" type="number" min="0" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} required />
            <Button type="submit" className="col-span-full">Guardar</Button>
            <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
          </form>
        )}
        <Table columns={['Tipo', 'Nombre', 'Unidad', 'Valor actual', 'Actualizar valor', '']}>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{TYPE_LABELS[it.type]}</td>
              <td className="py-1 pr-3">{it.name}</td>
              <td className="py-1 pr-3">{it.unit}</td>
              <td className="py-1 pr-3">{money(it.currentValue)}</td>
              <td className="py-1 pr-3">
                <Can module="cotizaciones" action="edit">
                  <div className="flex flex-wrap gap-2">
                    <Input type="number" min="0" placeholder="Nuevo valor" value={editing[it.id] || ''} onChange={(e) => setEditing((s) => ({ ...s, [it.id]: e.target.value }))} />
                    <Button onClick={() => updateValue(it.id)}>Actualizar</Button>
                  </div>
                </Can>
              </td>
              <td className="py-1 pr-3 text-right">
                <Can module="cotizaciones" action="delete"><Button variant="danger" onClick={() => remove(it.id)}>Eliminar</Button></Can>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6} className="py-2 text-center text-gray-400">Sin ítems registrados.</td></tr>}
        </Table>
      </Card>
    </div>
  );
}

function ImportSection({ onImported }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    setResult(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await priceItemsApi.importExcel(fd);
      setResult(res);
      setFile(null);
      e.target.reset();
      onImported();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card title="Importar Base de Precios desde Excel">
      <p className="text-sm text-gray-500 mb-3">
        El archivo debe tener columnas <strong>Tipo</strong> (material, mano_obra o equipo), <strong>Nombre</strong>,{' '}
        <strong>Unidad</strong> y <strong>Valor</strong>. Si un ítem ya existe (mismo tipo y nombre), se actualiza su valor
        en vez de duplicarlo.
      </p>
      <form onSubmit={submit} className="flex flex-wrap gap-3 items-end mb-2">
        <Input label="Archivo (.xlsx / .xls)" type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
        <Button type="submit" disabled={!file || uploading}>{uploading ? 'Importando...' : 'Importar'}</Button>
        <a href={priceItemsApi.templateUrl()} className="text-sm text-blue-600 hover:underline">Descargar plantilla de ejemplo</a>
      </form>
      <ErrorText>{error}</ErrorText>

      {result && (
        <div className="mt-3 border-t pt-3 text-sm">
          <p className="text-green-700 font-medium">
            {result.created} ítem(s) creado(s), {result.updated} actualizado(s).
          </p>
          {result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-yellow-700 font-medium">{result.errors.length} fila(s) con error:</p>
              <ul className="list-disc list-inside text-yellow-700">
                {result.errors.map((e, i) => (
                  <li key={i}>Fila {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
