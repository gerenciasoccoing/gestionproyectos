import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { budgetApi, progressApi, apuApi } from '../../api';
import { Card, Button, Input, SearchSelect, Table, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';

export default function BudgetProgressPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [budget, setBudget] = useState(null);
  const [items, setItems] = useState([]);
  const [apus, setApus] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({ apuId: '', description: '', notes: '', unit: '', quantity: '', unitCost: '' });
  const [aiuForm, setAiuForm] = useState({ adminPercent: '0', imprevistosPercent: '0', utilidadPercent: '0' });
  const [aiuSaved, setAiuSaved] = useState(false);
  const [error, setError] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importAiu, setImportAiu] = useState({ adminPercent: '0', imprevistosPercent: '0', utilidadPercent: '0' });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const [showExport, setShowExport] = useState(false);
  const [exportNames, setExportNames] = useState({ elaboroNombre: '', revisoNombre: '' });
  const [exportDownloading, setExportDownloading] = useState('');
  const [exportError, setExportError] = useState('');

  const load = () => budgetApi.get(projectId).then((data) => {
    setBudget(data.budget);
    setItems(data.items);
    if (data.budget) {
      setAiuForm({
        adminPercent: String(data.budget.adminPercent),
        imprevistosPercent: String(data.budget.imprevistosPercent),
        utilidadPercent: String(data.budget.utilidadPercent),
      });
    }
  });
  useEffect(() => { load(); apuApi.list().then(setApus); }, [projectId]);

  const ensureBudget = async () => {
    if (budget) return budget;
    const created = await budgetApi.createVersion(projectId, 'inicial');
    setBudget(created);
    return created;
  };

  const submitAiu = async (e) => {
    e.preventDefault();
    setError(''); setAiuSaved(false);
    try {
      const b = await ensureBudget();
      await budgetApi.updateAiu(projectId, b.id, aiuForm);
      setAiuSaved(true);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const submitItem = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const b = await ensureBudget();
      const payload = { ...itemForm };
      if (!payload.apuId) delete payload.apuId;
      await budgetApi.addItem(projectId, b.id, payload);
      setItemForm({ apuId: '', description: '', notes: '', unit: '', quantity: '', unitCost: '' });
      setShowItemForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  // La Descripción de un ítem basado en APU es siempre el nombre del APU (no se pide ni se
  // duplica a mano); solo se pide como texto libre cuando el ítem es manual (sin APU).
  const onApuChange = (apuId) => {
    const apu = apus.find((a) => a.id === apuId);
    setItemForm((f) => ({
      ...f,
      apuId,
      description: apu ? apu.name : '',
      unit: apu ? apu.unit : f.unit,
      unitCost: apu ? apu.unitCost.toFixed(2) : f.unitCost,
    }));
  };

  const submitImport = async (e) => {
    e.preventDefault();
    setImportError(''); setImportResult(null);
    if (!importFile) { setImportError(t('execution.budget.importSection.missingFile')); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('adminPercent', importAiu.adminPercent);
      fd.append('imprevistosPercent', importAiu.imprevistosPercent);
      fd.append('utilidadPercent', importAiu.utilidadPercent);
      const result = await budgetApi.importFile(projectId, fd);
      setImportResult(result);
      setImportFile(null);
      apuApi.list().then(setApus);
      load();
    } catch (err) {
      setImportError(extractError(err));
    } finally {
      setImporting(false);
    }
  };

  const downloadExport = async (format) => {
    setExportError('');
    setExportDownloading(format);
    try {
      if (format === 'pdf') await budgetApi.exportPdf(projectId, exportNames);
      else await budgetApi.exportExcel(projectId, exportNames);
    } catch (err) {
      setExportError(extractError(err));
    } finally {
      setExportDownloading('');
    }
  };

  return (
    <div>
      <Card title={t('execution.budget.importSection.title')} actions={
        <Can module="ejecucion" action="create">
          <Button onClick={() => setShowImport((s) => !s)}>{showImport ? t('common.cancel') : t('execution.budget.importSection.toggle')}</Button>
        </Can>
      }>
        {showImport && (
          <form onSubmit={submitImport} className="space-y-3">
            <p className="text-sm text-gray-600">
              {t('execution.budget.importSection.help')}
            </p>
            <Input label={t('execution.budget.importSection.file')} type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files[0])} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label={t('execution.budget.importSection.admin')} type="number" min="0" step="0.01" value={importAiu.adminPercent} onChange={(e) => setImportAiu({ ...importAiu, adminPercent: e.target.value })} />
              <Input label={t('execution.budget.importSection.unforeseen')} type="number" min="0" step="0.01" value={importAiu.imprevistosPercent} onChange={(e) => setImportAiu({ ...importAiu, imprevistosPercent: e.target.value })} />
              <Input label={t('execution.budget.importSection.profit')} type="number" min="0" step="0.01" value={importAiu.utilidadPercent} onChange={(e) => setImportAiu({ ...importAiu, utilidadPercent: e.target.value })} />
            </div>
            <p className="text-xs text-gray-400">
              {t('execution.budget.importSection.note')}
            </p>
            <Button type="submit" disabled={importing}>{importing ? t('execution.budget.importSection.submitting') : t('execution.budget.importSection.submit')}</Button>
            <ErrorText>{importError}</ErrorText>
          </form>
        )}
        {importResult && (
          <div className="mt-4 border-t pt-3 text-sm space-y-1">
            <p className="font-medium text-green-700">{t('execution.budget.importSection.done')}</p>
            <p>{t('execution.budget.importSection.summary', { items: importResult.budgetItemsCreated, apus: importResult.apusCreated, components: importResult.componentsCreated })}</p>
            <p>{t('execution.budget.importSection.priceBookSummary', { created: importResult.priceItemsCreated, updated: importResult.priceItemsUpdated })}</p>
            {importResult.skippedCount > 0 && (
              <details className="text-yellow-700">
                <summary className="cursor-pointer">{t('execution.budget.importSection.skipped', { count: importResult.skippedCount })}</summary>
                <ul className="list-disc pl-5 mt-1">
                  {importResult.skipped.map((s, i) => <li key={i}>{s.item} — {s.description}</li>)}
                </ul>
                {importResult.skippedCount > importResult.skipped.length && (
                  <p className="mt-1">{t('execution.budget.importSection.skippedMore', { count: importResult.skippedCount - importResult.skipped.length })}</p>
                )}
              </details>
            )}
          </div>
        )}
      </Card>

      <Card title={t('execution.budget.aiu.title')}>
        <form onSubmit={submitAiu} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Input
            label={t('execution.budget.importSection.admin')} type="number" min="0" step="0.01"
            value={aiuForm.adminPercent} onChange={(e) => setAiuForm({ ...aiuForm, adminPercent: e.target.value })}
          />
          <Input
            label={t('execution.budget.importSection.unforeseen')} type="number" min="0" step="0.01"
            value={aiuForm.imprevistosPercent} onChange={(e) => setAiuForm({ ...aiuForm, imprevistosPercent: e.target.value })}
          />
          <Input
            label={t('execution.budget.importSection.profit')} type="number" min="0" step="0.01"
            value={aiuForm.utilidadPercent} onChange={(e) => setAiuForm({ ...aiuForm, utilidadPercent: e.target.value })}
          />
          <Can module="ejecucion" action="edit">
            <div className="col-span-full flex items-center gap-3">
              <Button type="submit">{t('execution.budget.aiu.save')}</Button>
              <p className="text-xs text-gray-400">{t('execution.budget.aiu.note')}</p>
              {aiuSaved && <p className="text-sm text-green-600">{t('execution.budget.aiu.saved')}</p>}
            </div>
          </Can>
        </form>
      </Card>

      {budget && (
        <Card title={t('execution.budget.exportSection.title')} actions={
          <Button onClick={() => setShowExport((s) => !s)}>{showExport ? t('common.cancel') : t('execution.budget.exportSection.toggle')}</Button>
        }>
          {showExport && (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                {t('execution.budget.exportSection.help')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input label={t('execution.budget.exportSection.elaborated')} value={exportNames.elaboroNombre} onChange={(e) => setExportNames({ ...exportNames, elaboroNombre: e.target.value })} />
                <Input label={t('execution.budget.exportSection.reviewed')} value={exportNames.revisoNombre} onChange={(e) => setExportNames({ ...exportNames, revisoNombre: e.target.value })} />
              </div>
              <div className="flex gap-2 items-center">
                <Button onClick={() => downloadExport('pdf')} disabled={!!exportDownloading}>
                  {exportDownloading === 'pdf' ? t('execution.budget.exportSection.generatingPdf') : t('common.downloadPdf')}
                </Button>
                <Button variant="secondary" onClick={() => downloadExport('excel')} disabled={!!exportDownloading}>
                  {exportDownloading === 'excel' ? t('execution.budget.exportSection.generatingExcel') : t('common.downloadExcel')}
                </Button>
              </div>
              <ErrorText>{exportError}</ErrorText>
            </div>
          )}
        </Card>
      )}

      <Card title={t('execution.budget.items.title')} actions={
        <Can module="ejecucion" action="create">
          <Button onClick={() => setShowItemForm((s) => !s)}>{showItemForm ? t('common.cancel') : t('execution.budget.items.add')}</Button>
        </Can>
      }>
        {showItemForm && (
          <form onSubmit={submitItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <SearchSelect
              label={t('execution.budget.items.apuSearch')}
              options={apus.map((a) => ({ value: a.id, label: `${a.code ? `${a.code} - ` : ''}${a.name} (${money(a.unitCost)}/${a.unit})` }))}
              value={itemForm.apuId}
              onChange={onApuChange}
              placeholder={t('execution.budget.items.manualPlaceholder')}
            />
            {itemForm.apuId ? (
              <Input label={t('execution.budget.items.descriptionFromApu')} value={itemForm.description} disabled />
            ) : (
              <Input label={t('execution.budget.items.description')} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} required />
            )}
            <Input label={t('execution.budget.items.note')} value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
            <Input label={t('execution.budget.items.unit')} value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} required />
            <Input label={t('execution.budget.items.budgetedQty')} type="number" min="0" step="0.01" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} required />
            <Input label={t('execution.budget.items.unitValue')} type="number" min="0" step="0.01" value={itemForm.unitCost} onChange={(e) => setItemForm({ ...itemForm, unitCost: e.target.value })} disabled={!!itemForm.apuId} required />
            <Button type="submit">{t('execution.budget.items.save')}</Button>
            <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
          </form>
        )}

        <Table columns={[t('execution.budget.items.table.description'), t('execution.budget.items.table.budgetedQty'), t('execution.budget.items.table.executed'), t('execution.budget.items.table.percent'), t('execution.budget.items.table.unitValue'), t('execution.budget.items.table.total'), t('execution.budget.items.table.executedValue'), '']}>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">
                {it.description} <span className="text-gray-400">({it.unit})</span>
                {it.notes && <div className="text-xs text-gray-400">{t('execution.budget.items.noteLabel')}: {it.notes}</div>}
              </td>
              <td className="py-2 pr-3">{Number(it.quantity)}</td>
              <td className="py-2 pr-3">{it.accumulatedQty}</td>
              <td className="py-2 pr-3">
                <div className="w-24 bg-gray-200 rounded h-2">
                  <div className={`h-2 rounded ${it.percent > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(it.percent, 100)}%` }} />
                </div>
                <span className="text-xs">{it.percent}%{it.percent > 100 ? ' ⚠' : ''}</span>
              </td>
              <td className="py-2 pr-3">{money(it.unitCost)}</td>
              <td className="py-2 pr-3">{money(it.totalCost)}</td>
              <td className="py-2 pr-3">{money(it.executedValue)}</td>
              <td className="py-2 pr-3 text-right">
                <Button variant="secondary" onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}>
                  {expandedId === it.id ? t('execution.budget.items.closeButton') : t('execution.budget.items.progressButton')}
                </Button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-gray-400">{t('execution.budget.items.empty')}</td></tr>}
        </Table>
      </Card>

      {expandedId && (
        <ItemProgressPanel projectId={projectId} itemId={expandedId} onChange={load} />
      )}
    </div>
  );
}

function ItemProgressPanel({ projectId, itemId, onChange }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ date: '', quantityExecuted: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const load = () => progressApi.listEntries(projectId, itemId).then(setEntries);
  useEffect(() => { load(); }, [projectId, itemId]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setWarning('');
    try {
      const fd = new FormData();
      fd.append('date', form.date);
      fd.append('quantityExecuted', form.quantityExecuted);
      fd.append('notes', form.notes);
      [...files].forEach((f) => fd.append('photos', f));
      const res = await progressApi.createEntry(projectId, itemId, fd);
      if (res.warning) setWarning(res.warning);
      setForm({ date: '', quantityExecuted: '', notes: '' });
      setFiles([]);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const remove = async (entryId) => {
    if (!confirm(t('execution.budget.progress.confirmDelete'))) return;
    await progressApi.removeEntry(projectId, itemId, entryId);
    load();
    onChange();
  };

  return (
    <Card title={t('execution.budget.progress.title')}>
      <Can module="ejecucion" action="create">
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Input label={t('execution.budget.progress.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label={t('execution.budget.progress.executedQty')} type="number" min="0" step="0.01" value={form.quantityExecuted} onChange={(e) => setForm({ ...form, quantityExecuted: e.target.value })} required />
          <Input label={t('execution.budget.progress.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Input label={t('execution.budget.progress.photos')} type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
          <Button type="submit" className="col-span-full">{t('execution.budget.progress.register')}</Button>
          <div className="col-span-full">
            <ErrorText>{error}</ErrorText>
            {warning && <p className="text-sm text-yellow-600 mt-1">⚠ {warning}</p>}
          </div>
        </form>
      </Can>

      {entries.map((e) => (
        <div key={e.id} className="border-t border-gray-100 py-2 flex items-start justify-between">
          <div>
            <p className="text-sm"><strong>{formatDate(e.date)}</strong> — {Number(e.quantityExecuted)} {t('execution.budget.progress.units')} {e.notes && `— ${e.notes}`}</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {e.photos?.map((p) => (
                <a key={p.id} href={fileUrl(p.filePath)} target="_blank" rel="noreferrer">
                  <img src={fileUrl(p.filePath)} alt="avance" className="w-16 h-16 object-cover rounded border" />
                </a>
              ))}
            </div>
          </div>
          <Can module="ejecucion" action="delete">
            <Button variant="danger" onClick={() => remove(e.id)}>{t('common.delete')}</Button>
          </Can>
        </div>
      ))}
      {entries.length === 0 && <p className="text-gray-400 text-sm">{t('execution.budget.progress.empty')}</p>}
    </Card>
  );
}
