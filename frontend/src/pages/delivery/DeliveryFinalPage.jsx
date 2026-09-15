import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { deliveryDocumentsApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, formatDateTime } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const FIXED_CATEGORIES = ['factura', 'acta_entrega', 'liquidacion', 'informe_final'];

const EMPTY_FORM = { category: 'factura', customName: '' };

// Sección de cierre de proyecto: reutiliza el mismo patrón de carga de archivos que Contractual/
// Gastos (FormData + input file + Can por permiso de módulo), sin duplicar lógica. A diferencia de
// esas secciones, la carga acá NO se bloquea según el estado del proyecto (ver
// projectDeliveryDocumentController.js) — sigue disponible con el proyecto ya "Terminado".
export default function DeliveryFinalPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [docs, setDocs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const load = () => deliveryDocumentsApi.list(projectId).then(setDocs);
  useEffect(() => { load(); }, [projectId]);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    if (!file) { setError(t('delivery.missingFile')); return; }
    try {
      const fd = new FormData();
      fd.append('category', form.category);
      if (form.category === 'otro') fd.append('customName', form.customName);
      fd.append('file', file);
      await deliveryDocumentsApi.create(projectId, fd);
      setForm(EMPTY_FORM);
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (doc) => {
    if (!confirm(t('delivery.confirmDelete'))) return;
    await deliveryDocumentsApi.remove(projectId, doc.id);
    load();
  };

  const displayName = (doc) => (doc.category === 'otro' ? doc.customName : t(`delivery.categories.${doc.category}`));

  return (
    <Card title={t('delivery.title')} actions={
      <Can module="entrega_final" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('delivery.add')}</Button>
      </Can>
    }>
      <p className="text-sm text-gray-500 mb-4">{t('delivery.description')}</p>

      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Select label={t('delivery.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {FIXED_CATEGORIES.map((c) => <option key={c} value={c}>{t(`delivery.categories.${c}`)}</option>)}
            <option value="otro">{t('delivery.categories.otro')}</option>
          </Select>
          {form.category === 'otro' && (
            <Input label={t('delivery.customName')} value={form.customName} onChange={(e) => setForm({ ...form, customName: e.target.value })} required />
          )}
          <Input label={t('delivery.file')} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="col-span-full" />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      {!showForm && <ErrorText>{error}</ErrorText>}

      <Table columns={[t('delivery.table.name'), t('delivery.table.file'), t('delivery.table.uploadedAt'), t('delivery.table.uploadedBy'), '']}>
        {docs.map((d) => (
          <tr key={d.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{displayName(d)}</td>
            <td className="py-2 pr-3">
              <a className="text-blue-600 hover:underline" href={fileUrl(d.filePath)} target="_blank" rel="noreferrer">{t('common.view')}</a>
            </td>
            <td className="py-2 pr-3">{formatDateTime(d.createdAt)}</td>
            <td className="py-2 pr-3">{d.uploader?.name || '-'}</td>
            <td className="py-2 pr-3 text-right">
              <Can module="entrega_final" action="delete">
                <Button variant="danger" onClick={() => remove(d)}>{t('common.delete')}</Button>
              </Can>
            </td>
          </tr>
        ))}
        {docs.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('delivery.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
