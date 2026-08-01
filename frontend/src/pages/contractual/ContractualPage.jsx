import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { contractsApi, policiesApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError, money } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

export default function ContractualPage() {
  const { projectId } = useOutletContext();
  const [contracts, setContracts] = useState([]);
  const [policies, setPolicies] = useState([]);

  const load = () => {
    contractsApi.list(projectId).then(setContracts);
    policiesApi.list(projectId).then(setPolicies);
  };
  useEffect(() => { load(); }, [projectId]);

  return (
    <div>
      <ContractsSection projectId={projectId} contracts={contracts} onChange={load} />
      <PoliciesSection projectId={projectId} policies={policies} onChange={load} />
    </div>
  );
}

function ContractsSection({ projectId, contracts, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ object: '', value: '', signedDate: '', endDate: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      await contractsApi.create(projectId, fd);
      setForm({ object: '', value: '', signedDate: '', endDate: '' });
      setFile(null);
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este contrato?')) return;
    await contractsApi.remove(projectId, id);
    onChange();
  };

  return (
    <Card title="Contrato" actions={
      <Can module="contractual" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar'}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Input label="Objeto del contrato" value={form.object} onChange={(e) => setForm({ ...form, object: e.target.value })} required className="col-span-full" />
          <Input label="Valor" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          <Input label="Archivo (PDF/Word)" type="file" onChange={(e) => setFile(e.target.files[0])} />
          <Input label="Fecha de firma" type="date" value={form.signedDate} onChange={(e) => setForm({ ...form, signedDate: e.target.value })} required />
          <Input label="Fecha de terminación" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          <Button type="submit" className="col-span-full">Guardar contrato</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={['Objeto', 'Valor', 'Firma', 'Terminación', 'Archivo', '']}>
        {contracts.map((c) => (
          <tr key={c.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{c.object}</td>
            <td className="py-2 pr-3">{money(c.value)}</td>
            <td className="py-2 pr-3">{c.signedDate}</td>
            <td className="py-2 pr-3">{c.endDate}</td>
            <td className="py-2 pr-3">{c.filePath ? <a className="text-blue-600 hover:underline" href={fileUrl(c.filePath)} target="_blank" rel="noreferrer">Ver</a> : '-'}</td>
            <td className="py-2 pr-3 text-right">
              <Can module="contractual" action="delete"><Button variant="danger" onClick={() => remove(c.id)}>Eliminar</Button></Can>
            </td>
          </tr>
        ))}
        {contracts.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">Sin contratos.</td></tr>}
      </Table>
    </Card>
  );
}

function PoliciesSection({ projectId, policies, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: '', value: '', coverageStart: '', coverageEnd: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      await policiesApi.create(projectId, fd);
      setForm({ type: '', value: '', coverageStart: '', coverageEnd: '' });
      setFile(null);
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar esta póliza?')) return;
    await policiesApi.remove(projectId, id);
    onChange();
  };

  return (
    <Card title="Pólizas" actions={
      <Can module="contractual" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar'}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Input label="Tipo de garantía" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required />
          <Input label="Valor" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          <Input label="Inicio de cobertura" type="date" value={form.coverageStart} onChange={(e) => setForm({ ...form, coverageStart: e.target.value })} required />
          <Input label="Fin de cobertura" type="date" value={form.coverageEnd} onChange={(e) => setForm({ ...form, coverageEnd: e.target.value })} required />
          <Input label="Archivo" type="file" onChange={(e) => setFile(e.target.files[0])} />
          <Button type="submit" className="col-span-full">Guardar póliza</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={['Tipo', 'Valor', 'Inicio', 'Fin', 'Archivo', '']}>
        {policies.map((p) => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{p.type}</td>
            <td className="py-2 pr-3">{money(p.value)}</td>
            <td className="py-2 pr-3">{p.coverageStart}</td>
            <td className="py-2 pr-3">{p.coverageEnd}</td>
            <td className="py-2 pr-3">{p.filePath ? <a className="text-blue-600 hover:underline" href={fileUrl(p.filePath)} target="_blank" rel="noreferrer">Ver</a> : '-'}</td>
            <td className="py-2 pr-3 text-right">
              <Can module="contractual" action="delete"><Button variant="danger" onClick={() => remove(p.id)}>Eliminar</Button></Can>
            </td>
          </tr>
        ))}
        {policies.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">Sin pólizas.</td></tr>}
      </Table>
    </Card>
  );
}
