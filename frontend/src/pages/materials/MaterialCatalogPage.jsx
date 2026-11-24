import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialsApi, materialCategoriesApi } from '../../api';
import { Card, Button, Input, Select, Table, Badge, ErrorText, extractError, formatDate, money } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';
import MaterialImportWizard from './MaterialImportWizard';

const emptyForm = { name: '', unit: '', description: '', categoryId: '', code: '' };
const ORIGIN_LABELS = { orden_compra: 'purchaseOrder', manual: 'manual', importacion_excel: 'excelImport' };

// Catálogo de materiales del Inventario de Materiales — se auto-crea por nombre al crear/editar un
// ítem de una Orden de Compra (ver purchaseOrderController.js#resolveNewItemMaterial) o se importa
// masivamente desde Excel (ver MaterialImportWizard.jsx), y también es editable a mano acá. No se
// elimina un material ya usado en alguna OC o movimiento de bodega — solo se desactiva (setStatus),
// mismo criterio que AdminExpenseCategoriesPage.jsx; si tiene historia, remove() devuelve 409 y acá
// se ofrece desactivar en su lugar.
export default function MaterialCatalogPage() {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [mergeSurvivorId, setMergeSurvivorId] = useState('');

  const load = () => materialsApi.list(categoryFilter || undefined).then(setMaterials);
  useEffect(() => { load(); }, [categoryFilter]);
  useEffect(() => { materialCategoriesApi.list().then((list) => setCategories(list.filter((c) => c.active))); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(q) || (m.code || '').toLowerCase().includes(q));
  }, [materials, search]);

  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const startEdit = (m) => { setForm({ name: m.name, unit: m.unit || '', description: m.description || '', categoryId: m.categoryId || '', code: m.code || '' }); setEditingId(m.id); setShowForm(true); };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await materialsApi.update(editingId, form);
      else await materialsApi.create(form);
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (m) => {
    await materialsApi.setStatus(m.id, !m.active);
    load();
  };

  const toggleSelect = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [applyBulkRecategorize, applyingBulk] = useSubmitGuard(async () => {
    if (!bulkCategoryId || !selected.size) return;
    await materialsApi.bulkRecategorize([...selected], bulkCategoryId);
    setSelected(new Set());
    setBulkCategoryId('');
    load();
  });

  const [applyMerge, applyingMerge] = useSubmitGuard(async () => {
    if (!mergeSurvivorId || selected.size < 2) return;
    setError('');
    const losers = [...selected].filter((id) => id !== mergeSurvivorId);
    try {
      for (const loserId of losers) {
        // eslint-disable-next-line no-await-in-loop
        await materialsApi.merge(loserId, mergeSurvivorId);
      }
      setSelected(new Set());
      setMergeSurvivorId('');
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (m) => {
    setRowError({ ...rowError, [m.id]: '' });
    if (!confirm(t('materialsInventory.catalog.confirmDelete', { name: m.name }))) return;
    try {
      await materialsApi.remove(m.id);
      load();
    } catch (err) {
      setRowError({ ...rowError, [m.id]: extractError(err) });
    }
  };

  return (
    <Card title={t('materialsInventory.catalog.title')} actions={
      <div className="flex gap-2">
        <Can module="inventario_materiales" action="create">
          <Button variant="secondary" onClick={() => setShowImport((s) => !s)}>
            {showImport ? t('common.cancel') : t('materialsInventory.import.openWizard')}
          </Button>
          <Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>
            {showForm ? t('common.cancel') : t('materialsInventory.catalog.newMaterial')}
          </Button>
        </Can>
      </div>
    }>
      {showImport && (
        <div className="mb-4">
          <MaterialImportWizard onDone={() => { setShowImport(false); load(); }} />
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4 items-end">
          <Input label={t('materialsInventory.catalog.code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={t('materialsInventory.catalog.codeAuto')} />
          <Input label={t('materialsInventory.catalog.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('materialsInventory.catalog.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="m3, kg, un..." />
          <Select label={t('materialsInventory.categories.title')} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">{t('materialsInventory.categories.defaultHint')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label={t('materialsInventory.catalog.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button type="submit" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Input label={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('materialsInventory.catalog.searchPlaceholder')} />
        <Select label={t('materialsInventory.categories.title')} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 p-2 border border-blue-200 bg-blue-50/50 rounded flex flex-wrap items-end gap-2 text-sm">
          <span className="text-gray-600">{t('materialsInventory.catalog.selectedCount', { count: selected.size })}</span>
          <Select className="w-auto" value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
            <option value="">{t('materialsInventory.catalog.bulkRecategorizeTo')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant="secondary" onClick={applyBulkRecategorize} loading={applyingBulk} disabled={!bulkCategoryId}>
            {t('materialsInventory.catalog.applyBulkRecategorize')}
          </Button>
          {selected.size >= 2 && (
            <>
              <Select className="w-auto" value={mergeSurvivorId} onChange={(e) => setMergeSurvivorId(e.target.value)}>
                <option value="">{t('materialsInventory.catalog.mergeSurvivor')}</option>
                {materials.filter((m) => selected.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
              </Select>
              <Button variant="danger" onClick={applyMerge} loading={applyingMerge} disabled={!mergeSurvivorId}>
                {t('materialsInventory.catalog.applyMerge')}
              </Button>
            </>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>

      <Table columns={['', t('materialsInventory.catalog.code'), t('materialsInventory.catalog.name'), t('materialsInventory.catalog.unit'), t('materialsInventory.categories.title'), t('materialsInventory.catalog.lastCost'), t('materialsInventory.catalog.createdAt'), t('materialsInventory.catalog.origin'), t('materialsInventory.catalog.status'), '']}>
        {filtered.map((m) => (
          <tr key={m.id} className="border-b border-gray-100">
            <td className="py-1 pr-1"><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} /></td>
            <td className="py-1 pr-3">{m.code || '-'}</td>
            <td className="py-1 pr-3">{m.name}</td>
            <td className="py-1 pr-3">{m.unit || '-'}</td>
            <td className="py-1 pr-3">{m.category?.name || '-'}</td>
            <td className="py-1 pr-3">{m.lastPurchaseCost != null ? money(m.lastPurchaseCost) : '-'}</td>
            <td className="py-1 pr-3">{formatDate(m.createdAt)}</td>
            <td className="py-1 pr-3">{t(`materialsInventory.catalog.originLabels.${ORIGIN_LABELS[m.origin] || 'manual'}`)}</td>
            <td className="py-1 pr-3"><Badge color={m.active ? 'green' : 'gray'}>{t(m.active ? 'materialsInventory.catalog.active' : 'materialsInventory.catalog.inactive')}</Badge></td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">
              <Can module="inventario_materiales" action="edit">
                <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEdit(m)}>{t('common.edit')}</button>
                <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => toggleStatus(m)}>
                  {m.active ? t('materialsInventory.catalog.deactivate') : t('materialsInventory.catalog.activate')}
                </button>
              </Can>
              <Can module="inventario_materiales" action="delete">
                <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={() => remove(m)}>{t('common.delete')}</button>
              </Can>
              {rowError[m.id] && <div><ErrorText>{rowError[m.id]}</ErrorText></div>}
            </td>
          </tr>
        ))}
        {filtered.length === 0 && <tr><td colSpan={10} className="py-3 text-center text-gray-400">{t('materialsInventory.catalog.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
