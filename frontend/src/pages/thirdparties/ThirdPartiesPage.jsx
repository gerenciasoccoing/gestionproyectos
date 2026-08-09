import { useEffect, useState } from 'react';
import { thirdPartiesApi } from '../../api';
import { Card, Button, Input, TextArea, Table, ErrorText, extractError } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

const TYPES = [
  { value: 'proveedor', label: 'Proveedores' },
  { value: 'cliente', label: 'Clientes' },
];

const emptyForm = { type: 'proveedor', name: '', nit: '', email: '', phone: '', address: '', contactName: '', notes: '' };

// Compara NIT sin importar puntos/guiones/espacios ni mayúsculas (ej. "900.303.701-0" === "9003037010").
function normalizeNit(nit) {
  return String(nit || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

export default function ThirdPartiesPage() {
  const [type, setType] = useState('proveedor');
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, type: 'proveedor' });
  const [rutFile, setRutFile] = useState(null);
  const [bankFile, setBankFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [error, setError] = useState('');

  const load = () => thirdPartiesApi.list({ type }).then(setItems);
  useEffect(() => { load(); }, [type]);

  // Recibe el tipo explícito en vez de leerlo del estado `type`: si se llama justo después de
  // cambiar de pestaña (setType), el estado todavía no se actualizó (React lo aplica en el
  // siguiente render), así que leerlo de closure aquí guardaría el tipo de la pestaña anterior.
  const resetForm = (forType = type) => {
    setForm({ ...emptyForm, type: forType });
    setRutFile(null);
    setBankFile(null);
    setScanNotice('');
    setEditingId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      type: item.type, name: item.name, nit: item.nit || '', email: item.email || '',
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
        setError(`Ya existe ${form.type === 'proveedor' ? 'un proveedor' : 'un cliente'} registrado con este NIT: "${dup.name}". Verifica que no sea un duplicado.`);
        return;
      }
    }

    try {
      const fd = new FormData();
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
      setScanNotice('Lectura automática del RUT completada (local, sin IA externa) — revisa y corrige los datos antes de guardar.');
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este tercero?')) return;
    await thirdPartiesApi.remove(id);
    load();
  };

  const filtered = search
    ? items.filter((it) => it.name.toLowerCase().includes(search.toLowerCase()) || (it.nit || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => { setType(t.value); setShowForm(false); resetForm(t.value); }}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${type === t.value ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <Input label="Buscar por nombre o NIT" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Can module="terceros" action="create">
            <Button onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s); }}>
              {showForm ? 'Cancelar' : `+ ${type === 'proveedor' ? 'Nuevo proveedor' : 'Nuevo cliente'}`}
            </Button>
          </Can>
        </div>

        {showForm && (
          <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 items-end">
              <Input
                label="RUT (PDF, JPG, PNG)"
                type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => { setRutFile(e.target.files[0]); setScanNotice(''); }}
              />
              <Button type="button" variant="secondary" disabled={!rutFile || scanning} onClick={scanRutFile}>
                {scanning ? 'Leyendo RUT… puede tardar unos segundos' : 'Leer RUT automáticamente'}
              </Button>
            </div>
            {scanNotice && <p className="text-sm text-green-700 mb-3">{scanNotice}</p>}
            <p className="text-xs text-gray-400 mb-3">
              La lectura automática es local (OCR + reglas de texto, sin IA externa): úsala como apoyo, revisa siempre los datos.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label="Nombre / Razón social" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label="NIT" value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
              <Input label="Correo electrónico" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <Input label="Persona de contacto" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <TextArea label="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="col-span-full" rows={2} />
              {form.type === 'proveedor' && (
                <Input
                  label="Certificación bancaria (PDF/imagen)"
                  type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setBankFile(e.target.files[0])}
                  className="col-span-full sm:col-span-1"
                />
              )}
              <Button type="submit" className="col-span-full">{editingId ? 'Guardar cambios' : 'Guardar'}</Button>
              <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
            </div>
          </form>
        )}

        <Table columns={type === 'proveedor' ? ['Nombre', 'NIT', 'Correo', 'Teléfono', 'RUT', 'Cert. bancaria', ''] : ['Nombre', 'NIT', 'Correo', 'Teléfono', 'RUT', '']}>
          {filtered.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{it.name}</td>
              <td className="py-1 pr-3">{it.nit || '-'}</td>
              <td className="py-1 pr-3">{it.email || '-'}</td>
              <td className="py-1 pr-3">{it.phone || '-'}</td>
              <td className="py-1 pr-3">{it.rutFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(it.rutFilePath)} target="_blank" rel="noreferrer">Ver</a> : '-'}</td>
              {type === 'proveedor' && (
                <td className="py-1 pr-3">
                  {it.bankCertificationFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(it.bankCertificationFilePath)} target="_blank" rel="noreferrer">Ver</a> : '-'}
                </td>
              )}
              <td className="py-1 pr-3 text-right">
                <Can module="terceros" action="edit">
                  <Button variant="secondary" onClick={() => startEdit(it)}>Editar</Button>
                </Can>
                <Can module="terceros" action="delete">
                  <Button variant="danger" className="ml-2" onClick={() => remove(it.id)}>Eliminar</Button>
                </Can>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={type === 'proveedor' ? 7 : 6} className="py-3 text-center text-gray-400">Sin {type === 'proveedor' ? 'proveedores' : 'clientes'} registrados.</td></tr>}
        </Table>
      </Card>
    </div>
  );
}
