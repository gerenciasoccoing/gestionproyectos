import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { thirdPartiesApi } from '../../api';
import { Card, Button, Input, TextArea, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', nit: '', email: '', phone: '', address: '', contactName: '', notes: '' };
const STATUS_COLORS = { activo: 'green', suspendido: 'yellow', terminado: 'blue', liquidado: 'gray' };

// Compara NIT sin importar puntos/guiones/espacios ni mayúsculas (ej. "900.303.701-0" === "9003037010").
function normalizeNit(nit) {
  return String(nit || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

// Sección "Clientes" independiente de "Proveedores" (ver SuppliersPage.jsx para el porqué de la
// separación). Sin certificación bancaria (solo aplica a proveedores).
export default function ClientsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [rutFile, setRutFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => thirdPartiesApi.list({ type: 'cliente' }).then(setItems);
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setRutFile(null);
    setScanNotice('');
    setEditingId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name, nit: item.nit || '', email: item.email || '',
      phone: item.phone || '', address: item.address || '', contactName: item.contactName || '', notes: item.notes || '',
    });
    setRutFile(null);
    setScanNotice('');
    setShowForm(true);
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');

    const normalized = normalizeNit(form.nit);
    if (normalized) {
      const dup = items.find((it) => it.id !== editingId && normalizeNit(it.nit) === normalized);
      if (dup) {
        setError(t('thirdParties.duplicateNitClient', { name: dup.name }));
        return;
      }
    }

    try {
      const fd = new FormData();
      fd.append('type', 'cliente');
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (rutFile) fd.append('rutFile', rutFile);
      if (editingId) await thirdPartiesApi.update(editingId, fd);
      else await thirdPartiesApi.create(fd);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

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
      setScanNotice(t('thirdParties.scanDone'));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t('thirdParties.confirmDelete'))) return;
    await thirdPartiesApi.remove(id);
    if (expandedId === id) setExpandedId(null);
    load();
  };

  const filtered = search
    ? items.filter((it) => it.name.toLowerCase().includes(search.toLowerCase()) || (it.nit || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div>
      <Card title={t('thirdParties.tabs.clients')}>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <Input label={t('thirdParties.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Can module="terceros" action="create">
            <Button onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s); }}>
              {showForm ? t('common.cancel') : t('thirdParties.newClient')}
            </Button>
          </Can>
        </div>

        {showForm && (
          <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 items-end">
              <Input
                label={t('thirdParties.rut')}
                type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => { setRutFile(e.target.files[0]); setScanNotice(''); }}
              />
              <Button type="button" variant="secondary" disabled={!rutFile || scanning} onClick={scanRutFile}>
                {scanning ? t('thirdParties.readingRut') : t('thirdParties.readRutAuto')}
              </Button>
            </div>
            {scanNotice && <p className="text-sm text-green-700 mb-3">{scanNotice}</p>}
            <p className="text-xs text-gray-400 mb-3">{t('thirdParties.scanNote')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input label={t('thirdParties.fields.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label={t('thirdParties.fields.nit')} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
              <Input label={t('thirdParties.fields.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label={t('thirdParties.fields.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label={t('thirdParties.fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <Input label={t('thirdParties.fields.contactName')} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <TextArea label={t('thirdParties.fields.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="col-span-full" rows={2} />
              <Button type="submit" className="col-span-full" loading={submitting}>{editingId ? t('thirdParties.saveChanges') : t('thirdParties.save')}</Button>
              <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
            </div>
          </form>
        )}

        <Table columns={[t('thirdParties.table.name'), t('thirdParties.table.nit'), t('thirdParties.table.email'), t('thirdParties.table.phone'), t('thirdParties.table.rut'), '']}>
          {filtered.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{it.name}</td>
              <td className="py-1 pr-3">{it.nit || '-'}</td>
              <td className="py-1 pr-3">{it.email || '-'}</td>
              <td className="py-1 pr-3">{it.phone || '-'}</td>
              <td className="py-1 pr-3">{it.rutFilePath ? <a className="text-blue-600 hover:underline" href={fileUrl(it.rutFilePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <Button variant="secondary" onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}>
                  {expandedId === it.id ? t('common.close') : t('clients.projectsPanel.toggle')}
                </Button>
                <Can module="terceros" action="edit">
                  <Button variant="secondary" className="ml-2" onClick={() => startEdit(it)}>{t('common.edit')}</Button>
                </Can>
                <Can module="terceros" action="delete">
                  <Button variant="danger" className="ml-2" onClick={() => remove(it.id)}>{t('common.delete')}</Button>
                </Can>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('thirdParties.emptyClients')}</td></tr>}
        </Table>
      </Card>

      {expandedId && <ClientProjects clientId={expandedId} clientName={items.find((it) => it.id === expandedId)?.name} />}
    </div>
  );
}

// Proyectos vinculados a este cliente (Project.clientId) con el valor de su presupuesto vigente
// (nunca un campo manual, ver thirdPartyController.getClientProjects) y el total acumulado.
// Maneja explícitamente el caso de cero proyectos con un estado vacío en vez de una tabla en blanco.
function ClientProjects({ clientId, clientName }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    thirdPartiesApi.getProjects(clientId).then(setData).catch((err) => setError(extractError(err)));
  }, [clientId]);

  return (
    <Card title={t('clients.projectsPanel.title', { name: clientName })}>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <p className="text-sm text-gray-400">{t('common.loading')}</p>}
      {data && data.count === 0 && (
        <p className="text-sm text-gray-400 py-3 text-center">{t('clients.projectsPanel.empty')}</p>
      )}
      {data && data.count > 0 && (
        <>
          <Table columns={[t('clients.projectsPanel.table.project'), t('clients.projectsPanel.table.status'), t('clients.projectsPanel.table.value')]}>
            {data.projects.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-1 pr-3">{p.name}</td>
                <td className="py-1 pr-3"><Badge color={STATUS_COLORS[p.status]}>{t(`enums.projectStatus.${p.status}`, p.status)}</Badge></td>
                <td className="py-1 pr-3">{money(p.budgetValue)}</td>
              </tr>
            ))}
          </Table>
          <p className="text-sm font-semibold mt-3 text-right">{t('clients.projectsPanel.total', { count: data.count, amount: money(data.totalValue) })}</p>
        </>
      )}
    </Card>
  );
}
