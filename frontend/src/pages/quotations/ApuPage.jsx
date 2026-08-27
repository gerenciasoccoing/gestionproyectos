import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apuApi, priceItemsApi, companyApi } from '../../api';
import { Card, Button, Input, Select, SearchSelect, Table, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

function emptyRow(category, defaultPrestacionalPercent) {
  if (category === 'personal') {
    return { priceItemId: '', quantity: '1', yield: '1', prestacionalPercent: String(defaultPrestacionalPercent) };
  }
  if (category === 'herramienta') {
    return { priceItemId: '', quantity: '1', yield: '1' };
  }
  if (category === 'transporte') {
    return { priceItemId: '', description: '', transportMode: 'distancia_peso', quantity: '', transportDistance: '', unitValue: '', transportPercent: '' };
  }
  return { priceItemId: '', quantity: '1' }; // material
}

// El "valor base" de un insumo de mano de obra ya incluye prestaciones sociales (así se carga
// desde el catálogo oficial). El "Jornal día" se obtiene dividiendo ese valor base entre
// (1 + %prestaciones); TOTAL+PREST se recalcula multiplicando el jornal por (1 + %prestaciones),
// lo que con cantidad=1 siempre devuelve el valor base original (mismo criterio que el backend,
// ver budgetService.laborBreakdown).
function laborBreakdown(valorBase, prestacionalPercent, quantity = 1) {
  const p = (Number(prestacionalPercent) || 0) / 100;
  const jornalDia = valorBase / (1 + p);
  const totalPrest = (Number(quantity) || 0) * (jornalDia + jornalDia * p);
  return { jornalDia, totalPrest };
}

function laborRowTotal(row, priceItem) {
  const base = Number(priceItem?.currentValue || 0);
  const { totalPrest } = laborBreakdown(base, row.prestacionalPercent, row.quantity);
  const rend = Number(row.yield) || 1;
  return totalPrest / rend;
}

const emptyForm = { name: '', unit: '', code: '', otherCosts: '0' };
const PAGE_SIZE = 50;

export default function ApuPage() {
  const { t } = useTranslation();
  const SECTION_DEFS = [
    { category: 'material', title: t('apu.sections.material') },
    { category: 'herramienta', title: t('apu.sections.herramienta') },
    { category: 'personal', title: t('apu.sections.personal') },
    { category: 'transporte', title: t('apu.sections.transporte') },
  ];
  const [apus, setApus] = useState([]);
  const [priceItems, setPriceItems] = useState([]);
  const [defaultPrestacionalPercent, setDefaultPrestacionalPercent] = useState(85);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [sections, setSections] = useState({ material: [], herramienta: [], personal: [], transporte: [] });
  const [collapsed, setCollapsed] = useState({ material: false, herramienta: false, personal: false, transporte: false });
  const [expandedId, setExpandedId] = useState(null);
  const [expandedApu, setExpandedApu] = useState(null);
  const [exportId, setExportId] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importForm, setImportForm] = useState({ sourceLabel: '', effectiveDate: '' });
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const load = () => apuApi.list().then(setApus);
  useEffect(() => {
    load();
    priceItemsApi.list().then(setPriceItems);
    companyApi.get().then((s) => setDefaultPrestacionalPercent(Number(s.defaultPrestacionalPercent ?? 85)));
  }, []);

  const submitImport = async (e) => {
    e.preventDefault();
    setImportError(''); setImportResult(null);
    if (!importFile) { setImportError(t('apu.importSection.missingFile')); return; }
    if (!importForm.sourceLabel.trim()) { setImportError(t('apu.importSection.missingLabel')); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('sourceLabel', importForm.sourceLabel);
      if (importForm.effectiveDate) fd.append('effectiveDate', importForm.effectiveDate);
      const result = await apuApi.importCatalog(fd);
      setImportResult(result);
      setImportFile(null);
      load();
    } catch (err) {
      setImportError(extractError(err));
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apus;
    return apus.filter((a) => a.name.toLowerCase().includes(q) || (a.code || '').toLowerCase().includes(q));
  }, [apus, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageApus = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  const toggleComponents = async (id) => {
    if (expandedId === id) { setExpandedId(null); setExpandedApu(null); return; }
    setExpandedId(id);
    setExpandedApu(null);
    const full = await apuApi.get(id);
    setExpandedApu(full);
  };

  const priceItemsByType = (type) => priceItems.filter((p) => p.type === type);
  const priceById = (id) => priceItems.find((p) => p.id === id);

  const resetForm = () => {
    setForm(emptyForm);
    setSections({ material: [], herramienta: [], personal: [], transporte: [] });
    setEditingId(null);
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = async (apu) => {
    setError('');
    const full = await apuApi.get(apu.id);
    setForm({
      name: full.name,
      unit: full.unit,
      code: full.code || '',
      otherCosts: String(full.otherCosts ?? 0),
    });
    const next = { material: [], herramienta: [], personal: [], transporte: [] };
    (full.components || []).forEach((c) => {
      if (c.category === 'material') {
        next.material.push({ priceItemId: c.priceItemId, quantity: String(c.quantity) });
      } else if (c.category === 'herramienta') {
        next.herramienta.push({ priceItemId: c.priceItemId, quantity: String(c.quantity), yield: String(c.yield ?? 1) });
      } else if (c.category === 'personal') {
        next.personal.push({
          priceItemId: c.priceItemId,
          quantity: String(c.quantity),
          yield: String(c.yield ?? 1),
          prestacionalPercent: String(c.prestacionalPercent ?? defaultPrestacionalPercent),
        });
      } else if (c.category === 'transporte') {
        next.transporte.push({
          priceItemId: c.priceItemId || '',
          description: c.description || '',
          transportMode: c.transportMode || 'distancia_peso',
          quantity: c.quantity !== undefined ? String(c.quantity) : '',
          transportDistance: c.transportDistance !== undefined && c.transportDistance !== null ? String(c.transportDistance) : '',
          unitValue: c.unitValue !== undefined && c.unitValue !== null ? String(c.unitValue) : '',
          transportPercent: c.transportPercent !== undefined && c.transportPercent !== null ? String(c.transportPercent) : '',
        });
      }
    });
    setSections(next);
    setEditingId(apu.id);
    setShowForm(true);
  };

  const addRow = (category) => setSections((s) => ({ ...s, [category]: [...s[category], emptyRow(category, defaultPrestacionalPercent)] }));
  const updateRow = (category, idx, field, value) => setSections((s) => {
    const rows = [...s[category]];
    let row = { ...rows[idx], [field]: value };
    if (category === 'personal' && field === 'priceItemId' && !rows[idx].priceItemId) {
      // Al seleccionar por primera vez, autocompleta el factor prestacional por defecto.
      row.prestacionalPercent = String(defaultPrestacionalPercent);
    }
    rows[idx] = row;
    return { ...s, [category]: rows };
  });
  const removeRow = (category, idx) => setSections((s) => ({ ...s, [category]: s[category].filter((_, i) => i !== idx) }));

  // Subtotales calculados en tiempo real, con la misma fórmula que el backend (budgetService.computeSectionCosts).
  const materialsSubtotal = useMemo(
    () => sections.material.reduce((sum, r) => sum + (Number(r.quantity) || 0) * Number(priceById(r.priceItemId)?.currentValue || 0), 0),
    [sections.material, priceItems]
  );
  const herramientasSubtotal = useMemo(
    () => sections.herramienta.reduce(
      (sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.yield) || 1) * Number(priceById(r.priceItemId)?.currentValue || 0),
      0
    ),
    [sections.herramienta, priceItems]
  );
  const personalSubtotal = useMemo(
    () => sections.personal.reduce((sum, r) => sum + laborRowTotal(r, priceById(r.priceItemId)), 0),
    [sections.personal, priceItems]
  );
  const transporteSubtotal = useMemo(
    () => sections.transporte.reduce((sum, r) => {
      if (r.transportMode === 'porcentaje_materiales') {
        return sum + materialsSubtotal * ((Number(r.transportPercent) || 0) / 100);
      }
      const tarifa = r.priceItemId ? Number(priceById(r.priceItemId)?.currentValue || 0) : (Number(r.unitValue) || 0);
      return sum + (Number(r.quantity) || 0) * (Number(r.transportDistance) || 0) * tarifa;
    }, 0),
    [sections.transporte, priceItems, materialsSubtotal]
  );
  const totalDirectCost = materialsSubtotal + herramientasSubtotal + personalSubtotal + transporteSubtotal + (Number(form.otherCosts) || 0);

  const buildComponentsPayload = () => {
    const out = [];
    sections.material.forEach((r) => { if (r.priceItemId) out.push({ category: 'material', priceItemId: r.priceItemId, quantity: r.quantity || 0 }); });
    sections.herramienta.forEach((r) => { if (r.priceItemId) out.push({ category: 'herramienta', priceItemId: r.priceItemId, quantity: r.quantity || 0, yield: r.yield || 1 }); });
    sections.personal.forEach((r) => { if (r.priceItemId) out.push({ category: 'personal', priceItemId: r.priceItemId, quantity: r.quantity || 0, yield: r.yield || 1, prestacionalPercent: r.prestacionalPercent || 0 }); });
    sections.transporte.forEach((r) => {
      if (!r.priceItemId && !r.description) return;
      const base = { category: 'transporte', priceItemId: r.priceItemId || null, description: r.description || null, transportMode: r.transportMode };
      if (r.transportMode === 'porcentaje_materiales') {
        out.push({ ...base, transportPercent: r.transportPercent || 0 });
      } else {
        out.push({ ...base, quantity: r.quantity || 0, transportDistance: r.transportDistance || 0, unitValue: r.unitValue || null });
      }
    });
    return out;
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, components: buildComponentsPayload() };
      if (editingId) await apuApi.update(editingId, payload);
      else await apuApi.create(payload);
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (id) => {
    if (!confirm(t('apu.catalog.confirmDelete'))) return;
    await apuApi.remove(id);
    load();
  };

  return (
    <div>
      <Card title={t('apu.importSection.title')} actions={
        <Can module="cotizaciones" action="create">
          <Button onClick={() => setShowImport((s) => !s)}>{showImport ? t('common.cancel') : t('apu.importSection.toggle')}</Button>
        </Can>
      }>
        {showImport && (
          <form onSubmit={submitImport} className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('apu.importSection.help')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label={t('apu.importSection.sourceLabel')} value={importForm.sourceLabel} onChange={(e) => setImportForm({ ...importForm, sourceLabel: e.target.value })} required />
              <Input label={t('apu.importSection.effectiveDate')} type="date" value={importForm.effectiveDate} onChange={(e) => setImportForm({ ...importForm, effectiveDate: e.target.value })} />
              <Input label={t('apu.importSection.file')} type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files[0])} />
            </div>
            <Button type="submit" disabled={importing}>{importing ? t('apu.importSection.submitting') : t('apu.importSection.submit')}</Button>
            <ErrorText>{importError}</ErrorText>
          </form>
        )}
        {importResult && (
          <div className="mt-4 border-t pt-3 text-sm space-y-2">
            <p className="font-medium text-green-700">
              {t('apu.importSection.done', { label: importResult.sourceLabel, created: importResult.created, updated: importResult.updated, unchanged: importResult.unchanged })}
            </p>
            {importResult.changes.length > 0 ? (
              <div>
                <p className="text-gray-600 mb-1">{t('apu.importSection.changesTitle')}</p>
                <Table columns={[t('apu.importSection.changesTable.code'), t('apu.importSection.changesTable.name'), t('apu.importSection.changesTable.oldValue'), t('apu.importSection.changesTable.newValue'), t('apu.importSection.changesTable.deltaPercent'), t('apu.importSection.changesTable.budgetsUsing')]}>
                  {importResult.changes.map((c) => (
                    <tr key={c.apuId} className="border-b border-gray-100">
                      <td className="py-1 pr-3 text-gray-400">{c.code}</td>
                      <td className="py-1 pr-3">{c.name}</td>
                      <td className="py-1 pr-3">{money(c.oldTotal)}</td>
                      <td className="py-1 pr-3">{money(c.newTotal)}</td>
                      <td className={`py-1 pr-3 font-semibold ${c.deltaPercent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {c.deltaPercent !== null ? `${c.deltaPercent > 0 ? '+' : ''}${c.deltaPercent}%` : '-'}
                      </td>
                      <td className="py-1 pr-3">
                        {c.affectedBudgetItemsCount > 0 ? (
                          <span className="text-yellow-700">{t('apu.importSection.affectedItems', { count: c.affectedBudgetItemsCount })}</span>
                        ) : (
                          <span className="text-gray-400">{t('apu.importSection.noneAffected')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : (
              <p className="text-gray-500">{t('apu.importSection.noChanges')}</p>
            )}
          </div>
        )}
      </Card>

    <Card title={t('apu.catalog.title')} actions={
      <Can module="cotizaciones" action="create">
        <Button onClick={() => (showForm ? (setShowForm(false), resetForm()) : startCreate())}>
          {showForm ? t('common.cancel') : t('apu.catalog.new')}
        </Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <Input label={t('apu.catalog.itemName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label={t('apu.catalog.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            <Input label={t('apu.catalog.code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ApuSection
              def={SECTION_DEFS[0]}
              rows={sections.material}
              options={priceItemsByType('material')}
              subtotal={materialsSubtotal}
              collapsed={collapsed.material}
              onToggle={() => setCollapsed((c) => ({ ...c, material: !c.material }))}
              onAdd={() => addRow('material')}
              onUpdate={(idx, field, val) => updateRow('material', idx, field, val)}
              onRemove={(idx) => removeRow('material', idx)}
            />
            <ApuSection
              def={SECTION_DEFS[2]}
              rows={sections.personal}
              options={priceItemsByType('mano_obra')}
              subtotal={personalSubtotal}
              collapsed={collapsed.personal}
              onToggle={() => setCollapsed((c) => ({ ...c, personal: !c.personal }))}
              onAdd={() => addRow('personal')}
              onUpdate={(idx, field, val) => updateRow('personal', idx, field, val)}
              onRemove={(idx) => removeRow('personal', idx)}
            />
            <ApuSection
              def={SECTION_DEFS[1]}
              rows={sections.herramienta}
              options={priceItemsByType('equipo')}
              subtotal={herramientasSubtotal}
              collapsed={collapsed.herramienta}
              onToggle={() => setCollapsed((c) => ({ ...c, herramienta: !c.herramienta }))}
              onAdd={() => addRow('herramienta')}
              onUpdate={(idx, field, val) => updateRow('herramienta', idx, field, val)}
              onRemove={(idx) => removeRow('herramienta', idx)}
            />
            <ApuSection
              def={SECTION_DEFS[3]}
              rows={sections.transporte}
              options={priceItems}
              subtotal={transporteSubtotal}
              collapsed={collapsed.transporte}
              onToggle={() => setCollapsed((c) => ({ ...c, transporte: !c.transporte }))}
              onAdd={() => addRow('transporte')}
              onUpdate={(idx, field, val) => updateRow('transporte', idx, field, val)}
              onRemove={(idx) => removeRow('transporte', idx)}
            />
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-t pt-3">
            <Input
              label={t('apu.catalog.otherCosts')}
              type="number" min="0" step="0.01"
              value={form.otherCosts}
              onChange={(e) => setForm({ ...form, otherCosts: e.target.value })}
              className="max-w-xs"
            />
            <p className="text-lg font-semibold text-gray-800">{t('apu.catalog.totalDirect', { amount: money(totalDirectCost) })}</p>
          </div>

          <div className="mt-3">
            <Button type="submit" loading={submitting}>{editingId ? t('apu.catalog.saveChanges') : t('apu.catalog.save')}</Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-3 items-end mb-3">
        <Input label={t('apu.catalog.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <span className="text-sm text-gray-500 pb-1.5">{t('apu.catalog.count', { count: filtered.length })}</span>
      </div>

      <Table columns={[t('apu.catalog.table.code'), t('apu.catalog.table.name'), t('apu.catalog.table.unit'), t('apu.catalog.table.directCost'), '']}>
        {pageApus.map((a) => (
          <tr key={a.id} className="border-b border-gray-100">
            <td className="py-1 pr-3 text-gray-400">{a.code || '-'}</td>
            <td className="py-1 pr-3">{a.name}</td>
            <td className="py-1 pr-3">{a.unit}</td>
            <td className="py-1 pr-3 font-semibold">{money(a.directCost)}</td>
            <td className="py-1 pr-3 text-right flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => toggleComponents(a.id)}>
                {expandedId === a.id ? t('apu.catalog.close') : t('apu.catalog.components')}
              </Button>
              <Button variant="secondary" onClick={() => setExportId(exportId === a.id ? null : a.id)}>
                {exportId === a.id ? t('apu.catalog.close') : t('apu.catalog.export')}
              </Button>
              <Can module="cotizaciones" action="edit"><Button variant="secondary" onClick={() => startEdit(a)}>{t('common.edit')}</Button></Can>
              <Can module="cotizaciones" action="delete"><Button variant="danger" onClick={() => remove(a.id)}>{t('common.delete')}</Button></Can>
            </td>
          </tr>
        ))}
        {filtered.length === 0 && <tr><td colSpan={5} className="py-2 text-center text-gray-400">{t('apu.catalog.empty')}</td></tr>}
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-gray-500">{t('apu.catalog.page', { current: currentPage, total: totalPages })}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>{t('apu.catalog.previous')}</Button>
            <Button variant="secondary" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('apu.catalog.next')}</Button>
          </div>
        </div>
      )}

      {expandedId && !expandedApu && <p className="text-sm text-gray-400 mt-3">{t('apu.catalog.loadingComponents')}</p>}
      {expandedApu && <ApuComponents apu={expandedApu} />}
      {exportId && <ApuExportPanel apu={apus.find((a) => a.id === exportId)} />}
    </Card>
    </div>
  );
}

function ApuExportPanel({ apu }) {
  const { t } = useTranslation();
  const [aiu, setAiu] = useState({ adminPercent: '0', imprevistosPercent: '0', utilidadPercent: '0' });
  const [names, setNames] = useState({ elaboroNombre: '', revisoNombre: '' });
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');

  if (!apu) return null;

  const download = async (format) => {
    setError('');
    setDownloading(format);
    try {
      const payload = { ...aiu, ...names };
      if (format === 'pdf') await apuApi.exportPdf(apu.id, payload, apu.code);
      else await apuApi.exportExcel(apu.id, payload, apu.code);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="mt-3 border-t pt-3">
      <p className="font-medium text-sm mb-2">{t('apu.exportPanel.title', { name: apu.name })}</p>
      <p className="text-xs text-gray-500 mb-3">
        {t('apu.exportPanel.help')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Input label={t('apu.exportPanel.admin')} type="number" min="0" step="0.01" value={aiu.adminPercent} onChange={(e) => setAiu({ ...aiu, adminPercent: e.target.value })} />
        <Input label={t('apu.exportPanel.unforeseen')} type="number" min="0" step="0.01" value={aiu.imprevistosPercent} onChange={(e) => setAiu({ ...aiu, imprevistosPercent: e.target.value })} />
        <Input label={t('apu.exportPanel.profit')} type="number" min="0" step="0.01" value={aiu.utilidadPercent} onChange={(e) => setAiu({ ...aiu, utilidadPercent: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Input label={t('apu.exportPanel.elaborated')} value={names.elaboroNombre} onChange={(e) => setNames({ ...names, elaboroNombre: e.target.value })} />
        <Input label={t('apu.exportPanel.reviewed')} value={names.revisoNombre} onChange={(e) => setNames({ ...names, revisoNombre: e.target.value })} />
      </div>
      <div className="flex gap-2 items-center">
        <Button onClick={() => download('pdf')} disabled={!!downloading}>{downloading === 'pdf' ? t('apu.exportPanel.generatingPdf') : t('common.downloadPdf')}</Button>
        <Button variant="secondary" onClick={() => download('excel')} disabled={!!downloading}>{downloading === 'excel' ? t('apu.exportPanel.generatingExcel') : t('common.downloadExcel')}</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function ApuSection({ def, rows, options, subtotal, collapsed, onToggle, onAdd, onUpdate, onRemove }) {
  const { t } = useTranslation();
  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-lg">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 font-medium text-gray-800 text-sm">
          <span className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}>▾</span>
          {def.title}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{t('apu.sectionUi.total', { amount: money(subtotal) })}</span>
          <Button type="button" variant="primary" className="!rounded-full !w-7 !h-7 !p-0 flex items-center justify-center" onClick={onAdd}>+</Button>
        </div>
      </div>
      {!collapsed && (
        <div className="p-3 space-y-2">
          {rows.length === 0 && <p className="text-xs text-gray-400">{t('apu.sectionUi.empty')}</p>}
          {rows.map((row, idx) => (
            <SectionRow
              key={idx}
              category={def.category}
              row={row}
              options={options}
              onChange={(field, val) => onUpdate(idx, field, val)}
              onRemove={() => onRemove(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function priceItemLabel(p) {
  return `${p.name} (${money(p.currentValue)}/${p.unit})`;
}

function SectionRow({ category, row, options, onChange, onRemove }) {
  const { t } = useTranslation();
  const selected = options.find((p) => p.id === row.priceItemId);
  const searchOptions = options.map((p) => ({ value: p.id, label: priceItemLabel(p) }));

  if (category === 'material') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start sm:items-end">
        <SearchSelect label={t('apu.row.material')} className="col-span-2 sm:col-span-6" options={searchOptions} value={row.priceItemId} onChange={(v) => onChange('priceItemId', v)} />
        <Input label={t('apu.row.quantity')} className="col-span-1 sm:col-span-3" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
        <div className="col-span-1 sm:col-span-2 text-sm text-gray-600 pb-1.5 self-end">{money((Number(row.quantity) || 0) * Number(selected?.currentValue || 0))}</div>
        <Button type="button" variant="danger" className="col-span-2 sm:col-span-1" onClick={onRemove}>×</Button>
      </div>
    );
  }

  if (category === 'herramienta') {
    const total = (Number(row.quantity) || 0) * (Number(row.yield) || 1) * Number(selected?.currentValue || 0);
    return (
      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start sm:items-end">
        <SearchSelect label={t('apu.row.tool')} className="col-span-2 sm:col-span-5" options={searchOptions} value={row.priceItemId} onChange={(v) => onChange('priceItemId', v)} />
        <Input label={t('apu.row.quantity')} className="col-span-1 sm:col-span-2" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
        <Input label={t('apu.row.yield')} className="col-span-1 sm:col-span-2" type="number" min="0" step="0.0001" value={row.yield} onChange={(e) => onChange('yield', e.target.value)} />
        <div className="col-span-1 sm:col-span-2 text-sm text-gray-600 pb-1.5 self-end">{money(total)}</div>
        <Button type="button" variant="danger" className="col-span-1 sm:col-span-1" onClick={onRemove}>×</Button>
      </div>
    );
  }

  if (category === 'personal') {
    const base = Number(selected?.currentValue || 0);
    const { jornalDia } = laborBreakdown(base, row.prestacionalPercent);
    const total = laborRowTotal(row, selected);
    return (
      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start sm:items-end">
        <SearchSelect label={t('apu.row.personnel')} className="col-span-2 sm:col-span-4" options={searchOptions} value={row.priceItemId} onChange={(v) => onChange('priceItemId', v)} />
        <Input label={t('apu.row.quantity')} className="col-span-1 sm:col-span-2" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
        <Input label={t('apu.row.yield')} className="col-span-1 sm:col-span-2" type="number" min="0" step="0.0001" value={row.yield} onChange={(e) => onChange('yield', e.target.value)} />
        <Input label={t('apu.row.baseValue')} className="col-span-1 sm:col-span-2" value={money(base)} readOnly disabled />
        <Input label={t('apu.row.prestacionalPercent')} className="col-span-1 sm:col-span-1" type="number" min="0" step="0.01" value={row.prestacionalPercent} onChange={(e) => onChange('prestacionalPercent', e.target.value)} />
        <Button type="button" variant="danger" className="col-span-2 sm:col-span-1" onClick={onRemove}>×</Button>
        <Input label={t('apu.row.jornalDia')} className="col-span-1 sm:col-span-2" value={money(jornalDia)} readOnly disabled />
        <div className="col-span-full sm:col-span-10 text-right text-sm text-gray-600 self-end pb-1.5">{t('apu.row.itemValueWithPrest', { amount: money(total) })}</div>
      </div>
    );
  }

  // transporte
  const rate = row.priceItemId ? Number(selected?.currentValue || 0) : (Number(row.unitValue) || 0);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start sm:items-end">
      <Select label={t('apu.row.modality')} className="col-span-2 sm:col-span-3" value={row.transportMode} onChange={(e) => onChange('transportMode', e.target.value)}>
        <option value="distancia_peso">{t('apu.row.distanceWeight')}</option>
        <option value="porcentaje_materiales">{t('apu.row.percentOfMaterials')}</option>
      </Select>
      <SearchSelect label={t('apu.row.supplyOptional')} className="col-span-2 sm:col-span-4" options={searchOptions} value={row.priceItemId} onChange={(v) => onChange('priceItemId', v)} placeholder={t('apu.row.manualPlaceholder')} />
      {!row.priceItemId && (
        <Input label={t('apu.row.description')} className="col-span-2 sm:col-span-4" value={row.description} onChange={(e) => onChange('description', e.target.value)} />
      )}
      {row.transportMode === 'distancia_peso' ? (
        <>
          <Input label={t('apu.row.weight')} className="col-span-1 sm:col-span-2" type="number" min="0" step="0.0001" value={row.quantity} onChange={(e) => onChange('quantity', e.target.value)} />
          <Input label={t('apu.row.distance')} className="col-span-1 sm:col-span-2" type="number" min="0" step="0.0001" value={row.transportDistance} onChange={(e) => onChange('transportDistance', e.target.value)} />
          {!row.priceItemId && (
            <Input label={t('apu.row.valuePerKgKm')} className="col-span-2 sm:col-span-2" type="number" min="0" step="0.0001" value={row.unitValue} onChange={(e) => onChange('unitValue', e.target.value)} />
          )}
        </>
      ) : (
        <Input label={t('apu.row.percentOverMaterials')} className="col-span-2 sm:col-span-2" type="number" min="0" step="0.01" value={row.transportPercent} onChange={(e) => onChange('transportPercent', e.target.value)} />
      )}
      <Button type="button" variant="danger" className="col-span-2 sm:col-span-1" onClick={onRemove}>×</Button>
      {row.transportMode === 'distancia_peso' && (
        <div className="col-span-full text-right text-sm text-gray-600 -mt-1">
          {t('apu.row.totalValue', { amount: money((Number(row.quantity) || 0) * (Number(row.transportDistance) || 0) * rate) })}
        </div>
      )}
    </div>
  );
}

function ApuComponents({ apu }) {
  const { t } = useTranslation();
  if (!apu) return null;
  const label = (c) => {
    if (c.priceItem) return c.priceItem.name;
    return c.description || t('apu.components.noDescription');
  };
  const categoryLabel = {
    material: t('apu.components.categories.material'),
    herramienta: t('apu.components.categories.herramienta'),
    personal: t('apu.components.categories.personal'),
    transporte: t('apu.components.categories.transporte'),
  };
  return (
    <div className="mt-3 border-t pt-3">
      <p className="font-medium text-sm mb-2">{t('apu.components.title', { name: apu.name })}</p>
      <Table columns={[t('apu.components.table.supply'), t('apu.components.table.section'), t('apu.components.table.quantity'), t('apu.components.table.yield'), t('apu.components.table.unitValue')]}>
        {apu.components.map((c) => (
          <tr key={c.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{label(c)}</td>
            <td className="py-1 pr-3">{categoryLabel[c.category] || c.category}</td>
            <td className="py-1 pr-3">{Number(c.quantity)}</td>
            <td className="py-1 pr-3">{c.yield !== null && c.yield !== undefined ? Number(c.yield) : '-'}</td>
            <td className="py-1 pr-3">{money(c.priceItem ? c.priceItem.currentValue : c.unitValue)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
