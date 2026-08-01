import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { employeesApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';

export default function PersonnelListPage() {
  const { projectId } = useOutletContext();
  const [employees, setEmployees] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', position: '', entryDate: '', dedicationHours: '', salaryValue: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const load = () => employeesApi.list(projectId, showHistory ? 'retirado' : 'activo').then(setEmployees);
  useEffect(() => { load(); }, [projectId, showHistory]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      await employeesApi.create(projectId, fd);
      setForm({ name: '', position: '', entryDate: '', dedicationHours: '', salaryValue: '' });
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={showHistory ? 'Personal retirado (histórico)' : 'Personal activo'} actions={
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setShowHistory((s) => !s)}>
          {showHistory ? 'Ver activos' : 'Ver histórico de retirados'}
        </Button>
        {!showHistory && (
          <Can module="personal" action="create">
            <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar personal'}</Button>
          </Can>
        )}
      </div>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Rol/Cargo" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required />
          <Input label="Fecha de ingreso" type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required />
          <Input label="Dedicación (horas)" type="number" min="0" value={form.dedicationHours} onChange={(e) => setForm({ ...form, dedicationHours: e.target.value })} />
          <Input label="Salario mensual" type="number" min="0" value={form.salaryValue} onChange={(e) => setForm({ ...form, salaryValue: e.target.value })} required />
          <Input label="Contrato laboral (archivo)" type="file" onChange={(e) => setFile(e.target.files[0])} />
          <Button type="submit" className="col-span-full">Guardar</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={['Nombre', 'Cargo', 'Ingreso', 'Salida', 'Salario', 'Estado', '']}>
        {employees.map((emp) => (
          <tr key={emp.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{emp.name}</td>
            <td className="py-2 pr-3">{emp.position}</td>
            <td className="py-2 pr-3">{emp.entryDate}</td>
            <td className="py-2 pr-3">{emp.exitDate || '-'}</td>
            <td className="py-2 pr-3">{money(emp.salaryValue)}</td>
            <td className="py-2 pr-3"><Badge color={emp.status === 'activo' ? 'green' : 'gray'}>{emp.status}</Badge></td>
            <td className="py-2 pr-3 text-right">
              <Link to={`../personnel/${emp.id}`} className="text-blue-600 hover:underline text-sm">Ver detalle</Link>
            </td>
          </tr>
        ))}
        {employees.length === 0 && <tr><td colSpan={7} className="py-3 text-center text-gray-400">Sin registros.</td></tr>}
      </Table>
    </Card>
  );
}
