import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { priceItemsApi } from '../../api';
import { Card, Button, Input, Select, Table, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const PAGE_SIZE = 50;

export default function PriceBookPage() {
  const { t } = useTranslation();
  const TYPE_LABELS = { material: t('priceBook.types.material'), mano_obra: t('priceBook.types.mano_obra'), equipo: t('priceBook.types.equipo') };
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'material', code: '', name: '', unit: '', currentValue: '' });
  const [error, setError] = useState('');
  const [editing, setEditing] = useState({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = () => priceItemsApi.list().then(setItems);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter && it.type !== typeFilter) return false;
      if (!q) return true;
      return it.name.toLowerCase().includes(q) || (it.code || '').toLowerCase().includes(q);
    });
  }, [items, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, typeFilter]);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await priceItemsApi.create(form);
      setForm({ type: 'material', code: '', name: '', unit: '', currentValue: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const updateValue = async (id) => {
    const value = editing[id];
    if (value === undefined || value === '') return;
    await priceItemsApi.updateValue(id, { currentValue: value, effectiveDate: new Date().toISOString().slice(0, 10) });
    setEditing((e) => ({ ...e, [id]: undefined }));
    load();
  };

  const remove = async (id) => {
    if (!confirm(t('priceBook.confirmDelete'))) return;
    await priceItemsApi.remove(id);
    load();
  };

  return (
    <div>
      <Can module="cotizaciones" action="create">
        <ImportSection onImported={load} />
      </Can>

      <Card title={t('priceBook.title')} actions={
        <Can module="cotizaciones" action="create">
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('priceBook.add')}</Button>
        </Can>
      }>
        {showForm && (
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Select label={t('priceBook.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="material">{t('priceBook.types.material')}</option>
              <option value="mano_obra">{t('priceBook.types.mano_obra')}</option>
              <option value="equipo">{t('priceBook.types.equipo')}</option>
            </Select>
            <Input label={t('priceBook.code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input label={t('priceBook.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label={t('priceBook.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            <Input label={t('priceBook.value')} type="number" min="0" step="0.01" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} required />
            <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
            <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
          </form>
        )}

        <div className="flex flex-wrap gap-3 items-end mb-3">
          <Input label={t('priceBook.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Select label={t('priceBook.type')} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t('priceBook.typeAll')}</option>
            <option value="material">{t('priceBook.types.material')}</option>
            <option value="mano_obra">{t('priceBook.types.mano_obra')}</option>
            <option value="equipo">{t('priceBook.types.equipo')}</option>
          </Select>
          <span className="text-sm text-gray-500 pb-1.5">{t('priceBook.itemCount', { count: filtered.length })}</span>
        </div>

        <Table columns={[t('priceBook.table.code'), t('priceBook.table.type'), t('priceBook.table.name'), t('priceBook.table.unit'), t('priceBook.table.currentValue'), t('priceBook.table.updateValue'), '']}>
          {pageItems.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3 text-gray-400">{it.code || '-'}</td>
              <td className="py-1 pr-3">{TYPE_LABELS[it.type]}</td>
              <td className="py-1 pr-3">{it.name}</td>
              <td className="py-1 pr-3">{it.unit}</td>
              <td className="py-1 pr-3">{money(it.currentValue)}</td>
              <td className="py-1 pr-3">
                <Can module="cotizaciones" action="edit">
                  <div className="flex flex-wrap gap-2">
                    <Input type="number" min="0" step="0.01" placeholder={t('priceBook.newValuePlaceholder')} value={editing[it.id] || ''} onChange={(e) => setEditing((s) => ({ ...s, [it.id]: e.target.value }))} />
                    <Button onClick={() => updateValue(it.id)}>{t('priceBook.update')}</Button>
                  </div>
                </Can>
              </td>
              <td className="py-1 pr-3 text-right">
                <Can module="cotizaciones" action="delete"><Button variant="danger" onClick={() => remove(it.id)}>{t('common.delete')}</Button></Can>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={7} className="py-2 text-center text-gray-400">{t('priceBook.empty')}</td></tr>}
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm">
            <span className="text-gray-500">{t('priceBook.page', { current: currentPage, total: totalPages })}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>{t('priceBook.previous')}</Button>
              <Button variant="secondary" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('priceBook.next')}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ImportSection({ onImported }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    setResult(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await priceItemsApi.importExcel(fd);
      setResult(res);
      setFile(null);
      e.target.reset();
      onImported();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card title={t('priceBook.importTitle')}>
      <p className="text-sm text-gray-500 mb-3">
        {t('priceBook.importHelp')}
      </p>
      <form onSubmit={submit} className="flex flex-wrap gap-3 items-end mb-2">
        <Input label={t('priceBook.importFile')} type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
        <Button type="submit" disabled={!file || uploading}>{uploading ? t('priceBook.importing') : t('priceBook.import')}</Button>
        <a href={priceItemsApi.templateUrl()} className="text-sm text-blue-600 hover:underline">{t('priceBook.downloadTemplate')}</a>
      </form>
      <ErrorText>{error}</ErrorText>

      {result && (
        <div className="mt-3 border-t pt-3 text-sm">
          <p className="text-green-700 font-medium">
            {t('priceBook.importSummary', { created: result.created, updated: result.updated })}
          </p>
          {result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-yellow-700 font-medium">{t('priceBook.importErrors', { count: result.errors.length })}</p>
              <ul className="list-disc list-inside text-yellow-700 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i}>{t('priceBook.importErrorRow', { row: e.row, message: e.message })}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
