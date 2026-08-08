import { useEffect, useState } from 'react';
import { useOutletContext, useParams, Link } from 'react-router-dom';
import { employeesApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

export default function EmployeeDetailPage() {
  const { projectId } = useOutletContext();
  const { employeeId } = useParams();
  const [employee, setEmployee] = useState(null);

  const load = () => employeesApi.get(projectId, employeeId).then(setEmployee);
  useEffect(() => { load(); }, [projectId, employeeId]);

  if (!employee) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div>
      <Link to="../personnel" className="text-sm text-blue-600 hover:underline">&larr; Volver a personal</Link>
      <div className="flex items-center gap-3 mt-2 mb-4">
        <h2 className="text-lg font-bold">{employee.name}</h2>
        <Badge color={employee.status === 'activo' ? 'green' : 'gray'}>{employee.status}</Badge>
      </div>

      <Card title="Datos básicos">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div><span className="text-gray-500">Cargo:</span> {employee.position}</div>
          <div><span className="text-gray-500">Ingreso:</span> {employee.entryDate}</div>
          <div><span className="text-gray-500">Salida:</span> {employee.exitDate || '-'}</div>
          <div><span className="text-gray-500">Salario:</span> {money(employee.salaryValue)}</div>
          <div><span className="text-gray-500">Dedicación:</span> {employee.dedicationHours || '-'} h</div>
          <div><span className="text-gray-500">Contrato:</span> {employee.contractFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(employee.contractFilePath)} target="_blank" rel="noreferrer">Ver</a> : '-'}</div>
        </div>
      </Card>

      <SocialSecuritySection projectId={projectId} employee={employee} onChange={load} />
      <PaymentsSection projectId={projectId} employee={employee} onChange={load} />
      {employee.status === 'activo' ? (
        <SeveranceSection projectId={projectId} employee={employee} onChange={load} />
      ) : (
        <SeveranceSummary employee={employee} projectId={projectId} onChange={load} />
      )}
    </div>
  );
}

function SocialSecuritySection({ projectId, employee, onChange }) {
  const [form, setForm] = useState({ type: 'salud', uploadDate: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError('Debe adjuntar el archivo'); return; }
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('uploadDate', form.uploadDate || new Date().toISOString().slice(0, 10));
      fd.append('file', file);
      await employeesApi.addSocialSecurity(projectId, employee.id, fd);
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title="Seguridad Social (Salud, ARL, Pensión)">
      <Can module="personal" action="edit">
        <form onSubmit={submit} className="flex flex-wrap gap-3 items-end mb-3">
          <Select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="salud">Salud</option>
            <option value="arl">ARL</option>
            <option value="pension">Pensión</option>
          </Select>
          <Input label="Fecha" type="date" value={form.uploadDate} onChange={(e) => setForm({ ...form, uploadDate: e.target.value })} />
          <Input label="Archivo" type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <Button type="submit">Adjuntar</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Can>
      <Table columns={['Tipo', 'Fecha', 'Archivo']}>
        {employee.socialSecurityDocuments?.map((d) => (
          <tr key={d.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{d.type}</td>
            <td className="py-1 pr-3">{d.uploadDate}</td>
            <td className="py-1 pr-3"><a className="text-blue-600 hover:underline" href={fileUrl(d.filePath)} target="_blank" rel="noreferrer">Ver</a></td>
          </tr>
        ))}
        {(!employee.socialSecurityDocuments || employee.socialSecurityDocuments.length === 0) && (
          <tr><td colSpan={3} className="py-2 text-center text-gray-400">Sin documentos.</td></tr>
        )}
      </Table>
    </Card>
  );
}

function PaymentsSection({ projectId, employee, onChange }) {
  const [form, setForm] = useState({ date: '', periodLabel: '', amount: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError('Debe adjuntar el comprobante'); return; }
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('file', file);
      await employeesApi.addPayment(projectId, employee.id, fd);
      setForm({ date: '', periodLabel: '', amount: '' });
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title="Comprobantes de Pago (Nómina)">
      <Can module="personal" action="edit">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3 items-end">
          <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label="Periodo" placeholder="Ej: Julio 2026" value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} required />
          <Input label="Monto" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <Input label="Comprobante" type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <Button type="submit" className="col-span-full">Adjuntar comprobante</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Can>
      <Table columns={['Fecha', 'Periodo', 'Monto', 'Archivo']}>
        {employee.paymentReceipts?.map((p) => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{p.date}</td>
            <td className="py-1 pr-3">{p.periodLabel}</td>
            <td className="py-1 pr-3">{money(p.amount)}</td>
            <td className="py-1 pr-3"><a className="text-blue-600 hover:underline" href={fileUrl(p.filePath)} target="_blank" rel="noreferrer">Ver</a></td>
          </tr>
        ))}
        {(!employee.paymentReceipts || employee.paymentReceipts.length === 0) && (
          <tr><td colSpan={4} className="py-2 text-center text-gray-400">Sin comprobantes.</td></tr>
        )}
      </Table>
    </Card>
  );
}

function BreakdownTable({ breakdown }) {
  return (
    <Table columns={['Concepto', 'Fórmula', 'Valor']}>
      {breakdown.conceptos.map((c, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className="py-1 pr-3 font-medium">{c.concepto}</td>
          <td className="py-1 pr-3 text-xs text-gray-500">{c.formula}</td>
          <td className="py-1 pr-3">{money(c.valor)}</td>
        </tr>
      ))}
    </Table>
  );
}

function SeveranceSection({ projectId, employee, onChange }) {
  const [form, setForm] = useState({ exitDate: '', cause: 'renuncia' });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const doPreview = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await employeesApi.severancePreview(projectId, employee.id, form);
      setPreview(result);
    } catch (err) {
      setError(extractError(err));
    }
  };

  const confirm = async () => {
    if (!confirm) return;
    if (!window.confirm('¿Confirmar el retiro y liquidación? Esta acción pasará al empleado a histórico.')) return;
    setConfirming(true);
    setError('');
    try {
      await employeesApi.severanceConfirm(projectId, employee.id, form);
      onChange();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card title="Retiro y Liquidación de Prestaciones Sociales">
      <Can module="personal" action="edit">
        <form onSubmit={doPreview} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3 items-end">
          <Input label="Fecha de retiro" type="date" value={form.exitDate} onChange={(e) => setForm({ ...form, exitDate: e.target.value })} required />
          <Select label="Causal" value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })}>
            <option value="renuncia">Renuncia voluntaria</option>
            <option value="justa_causa">Terminación con justa causa</option>
            <option value="sin_justa_causa">Terminación sin justa causa</option>
            <option value="terminacion_termino">Terminación de contrato a término fijo</option>
          </Select>
          <Button type="submit">Calcular liquidación (previsualizar)</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Can>

      {preview && (
        <div className="mt-3 border-t pt-3">
          <BreakdownTable breakdown={preview.breakdown} />
          <p className="text-right font-bold text-lg mt-2">Total: {money(preview.total)}</p>
          <Can module="personal" action="edit">
            <div className="text-right mt-2">
              <Button variant="danger" onClick={confirm} disabled={confirming}>
                {confirming ? 'Procesando...' : 'Confirmar retiro y generar liquidación'}
              </Button>
            </div>
          </Can>
        </div>
      )}
    </Card>
  );
}

function SeveranceSummary({ employee, projectId, onChange }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const severance = employee.severance;
  if (!severance) return null;

  const upload = async () => {
    if (!file) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await employeesApi.uploadPazYSalvo(projectId, employee.id, fd);
      setFile(null);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title="Liquidación de Prestaciones Sociales (histórico)">
      <BreakdownTable breakdown={severance.breakdown} />
      <p className="text-right font-bold text-lg mt-2">Total: {money(severance.total)}</p>
      <div className="mt-3 border-t pt-3 flex items-center gap-3">
        {severance.pazYSalvoFilePath ? (
          <a className="text-blue-600 hover:underline text-sm" href={fileUrl(severance.pazYSalvoFilePath)} target="_blank" rel="noreferrer">Ver paz y salvo firmado</a>
        ) : (
          <Can module="personal" action="edit">
            <Input type="file" onChange={(e) => setFile(e.target.files[0])} />
            <Button onClick={upload}>Subir paz y salvo firmado</Button>
          </Can>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
