import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { minutesApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, Badge } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

const TYPES = ['inicio', 'suspension', 'reinicio', 'terminacion', 'final', 'liquidacion'];

export default function MinutesPage() {
  const { projectId } = useOutletContext();
  const [minutes, setMinutes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'inicio', date: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const load = () => minutesApi.list(projectId).then(setMinutes);
  useEffect(() => { load(); }, [projectId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError('Debe adjuntar el documento PDF del acta'); return; }
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('date', form.date);
      fd.append('file', file);
      await minutesApi.create(projectId, fd);
      setForm({ type: 'inicio', date: '' });
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar esta acta?')) return;
    await minutesApi.remove(projectId, id);
    load();
  };

  return (
    <Card title="Actas" actions={
      <Can module="ejecucion" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar acta'}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-3 gap-3 mb-4">
          <Select label="Tipo de acta" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label="Documento (PDF)" type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} required />
          <Button type="submit" className="col-span-3">Guardar acta</Button>
          <div className="col-span-3"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={['Tipo', 'Fecha', 'Documento', '']}>
        {minutes.map((m) => (
          <tr key={m.id} className="border-b border-gray-100">
            <td className="py-2 pr-3"><Badge>{m.type}</Badge></td>
            <td className="py-2 pr-3">{m.date}</td>
            <td className="py-2 pr-3"><a className="text-blue-600 hover:underline" href={fileUrl(m.filePath)} target="_blank" rel="noreferrer">Ver PDF</a></td>
            <td className="py-2 pr-3 text-right">
              <Can module="ejecucion" action="delete"><Button variant="danger" onClick={() => remove(m.id)}>Eliminar</Button></Can>
            </td>
          </tr>
        ))}
        {minutes.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">Sin actas registradas.</td></tr>}
      </Table>
    </Card>
  );
}
