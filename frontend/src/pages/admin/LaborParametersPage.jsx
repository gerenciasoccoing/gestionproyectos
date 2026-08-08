import { useEffect, useState } from 'react';
import { laborParamsApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError, money } from '../../components/ui';

const initialForm = {
  effectiveDate: '', smlv: '', auxTransporte: '', cesantiasDivisor: 360,
  interesesCesantiasPercent: 12, primaDivisor: 360, vacacionesDivisor: 720,
  topeAuxTransporteSalarios: 2, notes: '',
};

export default function LaborParametersPage() {
  const [params, setParams] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');

  const load = () => laborParamsApi.list().then(setParams);
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await laborParamsApi.create(form);
      setForm(initialForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title="Parámetros Laborales (Colombia)" actions={
      <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Nueva versión de parámetros'}</Button>
    }>
      <p className="text-sm text-gray-500 mb-3">
        Estos parámetros alimentan el cálculo de liquidación de prestaciones sociales. Se usa siempre la versión
        vigente más reciente (por fecha de vigencia) al momento de calcular cada liquidación.
      </p>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Input label="Vigente desde" type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required />
          <Input label="SMLV" type="number" min="0" step="0.01" value={form.smlv} onChange={(e) => setForm({ ...form, smlv: e.target.value })} required />
          <Input label="Auxilio de transporte" type="number" min="0" step="0.01" value={form.auxTransporte} onChange={(e) => setForm({ ...form, auxTransporte: e.target.value })} />
          <Input label="Tope aux. transporte (en SMLV)" type="number" min="0" step="0.01" value={form.topeAuxTransporteSalarios} onChange={(e) => setForm({ ...form, topeAuxTransporteSalarios: e.target.value })} />
          <Input label="Divisor cesantías" type="number" min="1" step="0.01" value={form.cesantiasDivisor} onChange={(e) => setForm({ ...form, cesantiasDivisor: e.target.value })} />
          <Input label="% intereses cesantías" type="number" min="0" step="0.01" value={form.interesesCesantiasPercent} onChange={(e) => setForm({ ...form, interesesCesantiasPercent: e.target.value })} />
          <Input label="Divisor prima" type="number" min="1" step="0.01" value={form.primaDivisor} onChange={(e) => setForm({ ...form, primaDivisor: e.target.value })} />
          <Input label="Divisor vacaciones" type="number" min="1" step="0.01" value={form.vacacionesDivisor} onChange={(e) => setForm({ ...form, vacacionesDivisor: e.target.value })} />
          <Input label="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="col-span-full" />
          <Button type="submit" className="col-span-full">Guardar nueva versión</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={['Vigente desde', 'SMLV', 'Aux. Transporte', '% Interés Cesantías', 'Notas']}>
        {params.map((p) => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{p.effectiveDate}</td>
            <td className="py-1 pr-3">{money(p.smlv)}</td>
            <td className="py-1 pr-3">{money(p.auxTransporte)}</td>
            <td className="py-1 pr-3">{Number(p.interesesCesantiasPercent)}%</td>
            <td className="py-1 pr-3 text-xs text-gray-500">{p.notes}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
