import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { quotationsApi, apuApi } from '../../api';
import { Card, Button, Input, SearchSelect, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';

export default function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [apus, setApus] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ apuId: '', description: '', notes: '', unit: '', quantity: '' });
  const [aiuForm, setAiuForm] = useState(null);
  const [aiuSaved, setAiuSaved] = useState(false);
  const [error, setError] = useState('');

  const [showExport, setShowExport] = useState(false);
  const [exportNames, setExportNames] = useState({ elaboroNombre: '', revisoNombre: '' });
  const [exportDownloading, setExportDownloading] = useState('');
  const [exportError, setExportError] = useState('');

  const load = () => quotationsApi.get(id).then((d) => {
    setData(d);
    if (d.budget) {
      setAiuForm({
        adminPercent: String(d.budget.adminPercent),
        imprevistosPercent: String(d.budget.imprevistosPercent),
        utilidadPercent: String(d.budget.utilidadPercent),
      });
    }
  });
  useEffect(() => { load(); apuApi.list().then(setApus); }, [id]);

  if (!data) return <div className="text-gray-500">Cargando...</div>;
  const { quotation, budget } = data;
  const items = budget?.items || [];
  const total = items.reduce((s, i) => s + Number(i.totalCost), 0);
  const isConverted = quotation.status === 'convertida';

  const submitAiu = async (e) => {
    e.preventDefault();
    setError(''); setAiuSaved(false);
    try {
      await quotationsApi.updateAiu(id, aiuForm);
      setAiuSaved(true);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  // La Descripción de un ítem basado en APU es siempre el nombre del APU (no se pide ni se
  // duplica a mano); solo se pide como texto libre cuando el ítem es manual (sin APU), igual que
  // en el presupuesto de Proyectos.
  const onApuChange = (apuId) => {
    const apu = apus.find((a) => a.id === apuId);
    setForm((f) => ({ ...f, apuId, description: apu ? apu.name : '', unit: apu ? apu.unit : f.unit }));
  };

  const submitItem = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form };
      if (!payload.apuId) delete payload.apuId;
      await quotationsApi.addItem(id, payload);
      setForm({ apuId: '', description: '', notes: '', unit: '', quantity: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const downloadExport = async (format) => {
    setExportError('');
    setExportDownloading(format);
    try {
      if (format === 'pdf') await quotationsApi.exportBudgetPdf(id, exportNames);
      else await quotationsApi.exportBudgetExcel(id, exportNames);
    } catch (err) {
      setExportError(extractError(err));
    } finally {
      setExportDownloading('');
    }
  };

  const removeItem = async (itemId) => {
    if (!confirm('¿Eliminar este ítem?')) return;
    await quotationsApi.removeItem(id, itemId);
    load();
  };

  const convert = async () => {
    if (!confirm('¿Convertir esta cotización en un proyecto? El presupuesto quedará asignado como línea base del proyecto.')) return;
    try {
      const project = await quotationsApi.convert(id);
      navigate(`/projects/${project.id}/contractual`);
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <div>
      <Link to="/quotations" className="text-sm text-blue-600 hover:underline">&larr; Volver a cotizaciones</Link>
      <div className="flex items-center gap-3 mt-2 mb-4">
        <h1 className="text-xl font-bold">{quotation.projectNameProposed}</h1>
        <Badge color={isConverted ? 'green' : 'gray'}>{quotation.status}</Badge>
      </div>

      <Card title="Datos de la cotización">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div><span className="text-gray-500">Cliente:</span> {quotation.clientName}</div>
          <div><span className="text-gray-500">Fecha:</span> {quotation.date}</div>
          <div><span className="text-gray-500">Validez:</span> {quotation.validityDays} días</div>
          <div><span className="text-gray-500">Condiciones:</span> {quotation.paymentTerms || '-'}</div>
        </div>
      </Card>

      {aiuForm && (
        <Card title="AIU del presupuesto">
          <form onSubmit={submitAiu} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <Input
              label="Administración (%)" type="number" min="0" step="0.01"
              value={aiuForm.adminPercent} onChange={(e) => setAiuForm({ ...aiuForm, adminPercent: e.target.value })}
              disabled={isConverted}
            />
            <Input
              label="Imprevistos (%)" type="number" min="0" step="0.01"
              value={aiuForm.imprevistosPercent} onChange={(e) => setAiuForm({ ...aiuForm, imprevistosPercent: e.target.value })}
              disabled={isConverted}
            />
            <Input
              label="Utilidad (%)" type="number" min="0" step="0.01"
              value={aiuForm.utilidadPercent} onChange={(e) => setAiuForm({ ...aiuForm, utilidadPercent: e.target.value })}
              disabled={isConverted}
            />
            {!isConverted && (
              <Can module="cotizaciones" action="edit">
                <div className="col-span-full flex items-center gap-3">
                  <Button type="submit">Guardar AIU</Button>
                  <p className="text-xs text-gray-400">Se aplica a los ítems basados en APU que agregues de aquí en adelante.</p>
                  {aiuSaved && <p className="text-sm text-green-600">Guardado.</p>}
                </div>
              </Can>
            )}
          </form>
        </Card>
      )}

      <Card title="Presupuesto (ítems basados en APU)" actions={
        !isConverted && (
          <Can module="cotizaciones" action="edit">
            <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar ítem'}</Button>
          </Can>
        )
      }>
        {showForm && (
          <form onSubmit={submitItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <SearchSelect
              label="APU (busca por código o nombre)"
              options={apus.map((a) => ({ value: a.id, label: `${a.code ? `${a.code} - ` : ''}${a.name} (${money(a.unitCost)}/${a.unit})` }))}
              value={form.apuId}
              onChange={onApuChange}
              placeholder="-- ítem manual --"
            />
            {form.apuId ? (
              <Input label="Descripción (del APU seleccionado)" value={form.description} disabled />
            ) : (
              <Input label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
            )}
            <Input label="Nota (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <Input label="Unidad" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            <Input label="Cantidad" type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            <Button type="submit" className="col-span-full">Agregar</Button>
            <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
          </form>
        )}
        <Table columns={['Descripción', 'Unidad', 'Cantidad', 'Vr. Unit.', 'Vr. Total', '']}>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">
                {it.description}
                {it.notes && <div className="text-xs text-gray-400">Nota: {it.notes}</div>}
              </td>
              <td className="py-1 pr-3">{it.unit}</td>
              <td className="py-1 pr-3">{Number(it.quantity)}</td>
              <td className="py-1 pr-3">{money(it.unitCost)}</td>
              <td className="py-1 pr-3">{money(it.totalCost)}</td>
              <td className="py-1 pr-3 text-right">
                {!isConverted && (
                  <Can module="cotizaciones" action="edit"><Button variant="danger" onClick={() => removeItem(it.id)}>Quitar</Button></Can>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6} className="py-2 text-center text-gray-400">Sin ítems.</td></tr>}
        </Table>
        <p className="text-right font-bold mt-2">Total: {money(total)}</p>
      </Card>

      {budget && items.length > 0 && (
        <Card title="Exportar presupuesto con anexo de APU" actions={
          <Button onClick={() => setShowExport((s) => !s)}>{showExport ? 'Cancelar' : '+ Exportar'}</Button>
        }>
          {showExport && (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Genera el resumen del presupuesto junto con la ficha detallada de cada APU usado (con el mismo
                formato de "modelo_apu.xlsx" y el AIU de esta cotización). Los nombres de firma se repiten en cada
                página de APU y no se guardan como datos del sistema.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input label="Elaboró y validó" value={exportNames.elaboroNombre} onChange={(e) => setExportNames({ ...exportNames, elaboroNombre: e.target.value })} />
                <Input label="Revisó y Aprobó" value={exportNames.revisoNombre} onChange={(e) => setExportNames({ ...exportNames, revisoNombre: e.target.value })} />
              </div>
              <div className="flex gap-2 items-center">
                <Button onClick={() => downloadExport('pdf')} disabled={!!exportDownloading}>
                  {exportDownloading === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
                </Button>
                <Button variant="secondary" onClick={() => downloadExport('excel')} disabled={!!exportDownloading}>
                  {exportDownloading === 'excel' ? 'Generando Excel…' : 'Descargar Excel'}
                </Button>
              </div>
              <ErrorText>{exportError}</ErrorText>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <a href={quotationsApi.pdfUrl(id)} target="_blank" rel="noreferrer">
          <Button variant="secondary">Generar PDF de propuesta</Button>
        </a>
        {!isConverted && (
          <Can module="cotizaciones" action="edit">
            <Button onClick={convert}>Convertir a proyecto</Button>
          </Can>
        )}
        {isConverted && quotation.convertedProjectId && (
          <Link to={`/projects/${quotation.convertedProjectId}/contractual`}>
            <Button variant="secondary">Ir al proyecto</Button>
          </Link>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
