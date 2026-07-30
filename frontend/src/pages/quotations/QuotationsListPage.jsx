import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quotationsApi } from '../../api';
import { Card, Button, Input, TextArea, Table, Badge, ErrorText, extractError } from '../../components/ui';
import Can from '../../components/Can';

export default function QuotationsListPage() {
  const [quotations, setQuotations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: '', projectNameProposed: '', date: '', validityDays: 30, paymentTerms: '' });
  const [error, setError] = useState('');

  const load = () => quotationsApi.list().then(setQuotations);
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await quotationsApi.create(form);
      setForm({ clientName: '', projectNameProposed: '', date: '', validityDays: 30, paymentTerms: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const statusColor = { borrador: 'gray', enviada: 'yellow', convertida: 'green' };

  return (
    <Card title="Cotizaciones" actions={
      <Can module="cotizaciones" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Nueva cotización'}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 mb-4">
          <Input label="Cliente" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} required />
          <Input label="Nombre del proyecto propuesto" value={form.projectNameProposed} onChange={(e) => setForm({ ...form, projectNameProposed: e.target.value })} required />
          <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label="Validez (días)" type="number" min="1" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} />
          <TextArea label="Condiciones de pago" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className="col-span-2" />
          <Button type="submit" className="col-span-2">Crear cotización</Button>
          <div className="col-span-2"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={['Cliente', 'Proyecto propuesto', 'Fecha', 'Estado', '']}>
        {quotations.map((q) => (
          <tr key={q.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{q.clientName}</td>
            <td className="py-2 pr-3">{q.projectNameProposed}</td>
            <td className="py-2 pr-3">{q.date}</td>
            <td className="py-2 pr-3"><Badge color={statusColor[q.status]}>{q.status}</Badge></td>
            <td className="py-2 pr-3 text-right">
              <Link to={`/quotations/${q.id}`} className="text-blue-600 hover:underline text-sm">Ver detalle</Link>
            </td>
          </tr>
        ))}
        {quotations.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">Sin cotizaciones.</td></tr>}
      </Table>
    </Card>
  );
}
