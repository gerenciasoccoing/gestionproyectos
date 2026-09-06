import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { budgetApi, apuApi } from '../../api';
import { Card, Button, Input, SearchSelect, Table, Badge, ErrorText, extractError, money } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';
import ProjectApuWizard from './ProjectApuWizard';
import ResourceConsolidationSection from './ResourceConsolidationSection';

// Presupuesto del Proyecto: único lugar donde se carga/edita el presupuesto en ejecución
// (import oficial, IA sin APU, AIU, cantidades, export). "Avance por Ítem" (ProgressPage.jsx)
// ya no tiene ninguna de estas acciones — solo registra avance sobre los ítems que este
// componente crea.
export default function BudgetPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [budget, setBudget] = useState(null);
  const [items, setItems] = useState([]);
  const [apus, setApus] = useState([]);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({ apuId: '', description: '', notes: '', unit: '', quantity: '', unitCost: '' });
  const [showAiForm, setShowAiForm] = useState(false);
  const [showApuWizard, setShowApuWizard] = useState(false);
  const [aiFile, setAiFile] = useState(null);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiPreviewItems, setAiPreviewItems] = useState(null);
  const [aiConfirming, setAiConfirming] = useState(false);
  const [editingQtyId, setEditingQtyId] = useState(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [qtyError, setQtyError] = useState('');
  const [savingQty, setSavingQty] = useState(false);
  const [aiuForm, setAiuForm] = useState({ adminPercent: '0', imprevistosPercent: '0', utilidadPercent: '0' });
  const [aiuSaved, setAiuSaved] = useState(false);
  const [error, setError] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importAiu, setImportAiu] = useState({ adminPercent: '0', imprevistosPercent: '0', utilidadPercent: '0' });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const [expandedApuItemId, setExpandedApuItemId] = useState(null);
  const [apuDetail, setApuDetail] = useState(null);
  const [apuDetailLoading, setApuDetailLoading] = useState(false);
  const [apuDetailError, setApuDetailError] = useState('');

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

  const [submitItem, submittingItem] = useSubmitGuard(async (e) => {
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
  });

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

  // Opción 2 (sin APU, con IA): sube un presupuesto libre y muestra una vista previa editable
  // antes de crear nada — el usuario revisa/corrige cada fila y solo entonces se confirma en
  // bloque (addItemsBulk). Los ítems resultantes siempre quedan sin apuId (con itemCode generado
  // por el backend), igual que un ítem manual.
  const scanAiFile = async () => {
    if (!aiFile) return;
    setAiScanning(true);
    setAiError('');
    setAiPreviewItems(null);
    try {
      const fd = new FormData();
      fd.append('file', aiFile);
      const result = await budgetApi.scanItems(projectId, fd);
      setAiPreviewItems(result.items.map((it) => ({
        description: it.description || '',
        unit: it.unit || '',
        quantity: it.quantity != null ? String(it.quantity) : '',
        unitCost: it.unitPrice != null ? String(it.unitPrice) : '',
      })));
    } catch (err) {
      setAiError(extractError(err));
    } finally {
      setAiScanning(false);
    }
  };

  const updateAiPreviewField = (idx, field, value) => {
    setAiPreviewItems((list) => list.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const removeAiPreviewRow = (idx) => {
    setAiPreviewItems((list) => list.filter((_, i) => i !== idx));
  };

  const cancelAiForm = () => {
    setShowAiForm(false);
    setAiFile(null);
    setAiPreviewItems(null);
    setAiError('');
  };

  const confirmAiItems = async () => {
    setAiError('');
    setAiConfirming(true);
    try {
      const b = await ensureBudget();
      await budgetApi.addItemsBulk(projectId, b.id, aiPreviewItems);
      cancelAiForm();
      load();
    } catch (err) {
      setAiError(extractError(err));
    } finally {
      setAiConfirming(false);
    }
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

  const startEditQty = (it) => {
    setEditingQtyId(it.id);
    setQtyDraft(String(it.quantity));
    setQtyError('');
  };

  const saveQty = async (it) => {
    setQtyError('');
    setSavingQty(true);
    try {
      await budgetApi.updateItem(projectId, it.budgetId, it.id, { quantity: qtyDraft });
      setEditingQtyId(null);
      load();
    } catch (err) {
      setQtyError(extractError(err));
    } finally {
      setSavingQty(false);
    }
  };

  const toggleApuDetail = async (it) => {
    if (expandedApuItemId === it.id) {
      setExpandedApuItemId(null);
      return;
    }
    setExpandedApuItemId(it.id);
    setApuDetail(null);
    setApuDetailError('');
    setApuDetailLoading(true);
    try {
      const detail = await budgetApi.getItemApuDetail(projectId, it.budgetId, it.id);
      setApuDetail(detail);
    } catch (err) {
      setApuDetailError(extractError(err));
    } finally {
      setApuDetailLoading(false);
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
          <Button variant="secondary" onClick={() => setShowAiForm((s) => !s)}>{showAiForm ? t('common.cancel') : t('execution.budget.items.aiAdd')}</Button>
          <Button variant="secondary" onClick={() => setShowApuWizard((s) => !s)}>{showApuWizard ? t('common.cancel') : t('execution.budget.items.apuWizard.toggle')}</Button>
        </Can>
      }>
        {showApuWizard && (
          <ProjectApuWizard
            projectId={projectId}
            ensureBudget={ensureBudget}
            onDone={() => { setShowApuWizard(false); load(); }}
            onCancel={() => setShowApuWizard(false)}
          />
        )}

        {showAiForm && (
          <div className="mb-4 border rounded p-3 bg-gray-50">
            <p className="text-sm text-gray-600 mb-3">{t('execution.budget.items.aiHelp')}</p>
            {!aiPreviewItems && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end mb-2">
                <Input
                  label={t('execution.budget.items.aiFile')}
                  type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
                  onChange={(e) => { setAiFile(e.target.files[0]); setAiError(''); }}
                />
                <Button type="button" disabled={!aiFile || aiScanning} onClick={scanAiFile}>
                  {aiScanning ? t('execution.budget.items.aiScanning') : t('execution.budget.items.aiScan')}
                </Button>
              </div>
            )}
            <ErrorText>{aiError}</ErrorText>

            {aiPreviewItems && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <Badge color="yellow">{t('execution.budget.items.aiNoApuBadge')}</Badge>
                  <span className="text-sm text-gray-500">{t('execution.budget.items.aiPreviewCount', { count: aiPreviewItems.length })}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-1 pr-2">{t('execution.budget.items.table.description')}</th>
                        <th className="py-1 pr-2">{t('execution.budget.items.unit')}</th>
                        <th className="py-1 pr-2">{t('execution.budget.items.budgetedQty')}</th>
                        <th className="py-1 pr-2">{t('execution.budget.items.unitValue')}</th>
                        <th className="py-1 pr-2 text-right">{t('execution.budget.items.table.total')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiPreviewItems.map((it, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-1 pr-2">
                            <input className="border border-gray-300 rounded px-2 py-1 w-56" value={it.description} onChange={(e) => updateAiPreviewField(idx, 'description', e.target.value)} />
                          </td>
                          <td className="py-1 pr-2">
                            <input className="border border-gray-300 rounded px-2 py-1 w-16" value={it.unit} onChange={(e) => updateAiPreviewField(idx, 'unit', e.target.value)} />
                          </td>
                          <td className="py-1 pr-2">
                            <input className="border border-gray-300 rounded px-2 py-1 w-24 text-right" type="number" min="0" step="0.01" value={it.quantity} onChange={(e) => updateAiPreviewField(idx, 'quantity', e.target.value)} />
                          </td>
                          <td className="py-1 pr-2">
                            <input className="border border-gray-300 rounded px-2 py-1 w-28 text-right" type="number" min="0" step="0.01" value={it.unitCost} onChange={(e) => updateAiPreviewField(idx, 'unitCost', e.target.value)} />
                          </td>
                          <td className="py-1 pr-2 text-right whitespace-nowrap">{money(Number(it.quantity || 0) * Number(it.unitCost || 0))}</td>
                          <td className="py-1 pl-2">
                            <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => removeAiPreviewRow(idx)}>{t('common.delete')}</button>
                          </td>
                        </tr>
                      ))}
                      {aiPreviewItems.length === 0 && (
                        <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('execution.budget.items.aiPreviewEmpty')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                  <p className="text-sm font-medium">
                    {t('execution.budget.items.aiPreviewTotal', { amount: money(aiPreviewItems.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitCost || 0), 0)) })}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={cancelAiForm}>{t('common.cancel')}</Button>
                    <Button disabled={aiConfirming || aiPreviewItems.length === 0} onClick={confirmAiItems}>
                      {aiConfirming ? t('execution.budget.items.aiConfirming') : t('execution.budget.items.aiConfirm')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
            <Button type="submit" loading={submittingItem}>{t('execution.budget.items.save')}</Button>
            <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
          </form>
        )}

        <Table columns={[t('execution.budget.items.table.code'), t('execution.budget.items.table.description'), t('execution.budget.items.table.budgetedQty'), t('execution.budget.items.table.unitValue'), t('execution.budget.items.table.total'), '']}>
          {items.map((it) => (
            <Fragment key={it.id}>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-3 text-gray-400 font-mono text-xs">{it.APU?.code || it.itemCode || '-'}</td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{it.description} <span className="text-gray-400">({it.unit})</span></span>
                  {!it.apuId && <Badge color="yellow">{t('execution.budget.items.aiNoApuBadge')}</Badge>}
                </div>
                {it.notes && <div className="text-xs text-gray-400">{t('execution.budget.items.noteLabel')}: {it.notes}</div>}
              </td>
              <td className="py-2 pr-3">
                {editingQtyId === it.id ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" min="0" step="0.01" value={qtyDraft} onChange={(e) => setQtyDraft(e.target.value)} className="w-24" autoFocus />
                    <Button variant="secondary" disabled={savingQty} onClick={() => saveQty(it)}>{t('common.save')}</Button>
                    <Button variant="ghost" onClick={() => setEditingQtyId(null)}>{t('common.cancel')}</Button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    {Number(it.quantity)}
                    <Can module="ejecucion" action="edit">
                      <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEditQty(it)}>{t('common.edit')}</button>
                    </Can>
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">{money(it.unitCost)}</td>
              <td className="py-2 pr-3">{money(it.totalCost)}</td>
              <td className="py-2 pr-3 text-right">
                {it.apuId && (
                  <Button variant="secondary" onClick={() => toggleApuDetail(it)}>
                    {expandedApuItemId === it.id ? t('execution.budget.items.closeButton') : t('execution.budget.items.apuWizard.viewApu')}
                  </Button>
                )}
              </td>
            </tr>
            {expandedApuItemId === it.id && (
              <tr className="border-b border-gray-100 bg-gray-50">
                <td colSpan={6} className="py-3 px-3">
                  <ApuDetailView loading={apuDetailLoading} error={apuDetailError} detail={apuDetail} />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          {items.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('execution.budget.items.empty')}</td></tr>}
        </Table>
        <ErrorText>{qtyError}</ErrorText>
      </Card>

      <ResourceConsolidationSection projectId={projectId} refreshKey={items} />
    </div>
  );
}

// Detalle desplegable del APU de un ítem (modo "con APU"): reutiliza tal cual la ficha que ya
// arma buildApuExportData en el backend (misma que usa el PDF/Excel del presupuesto) — acá solo
// se muestra en pantalla, sin recalcular nada.
function ApuDetailView({ loading, error, detail }) {
  const { t } = useTranslation();
  if (loading) return <p className="text-sm text-gray-500">{t('common.loading')}</p>;
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!detail) return null;

  return (
    <div className="space-y-3 text-sm">
      <ApuSection title={t('execution.budget.items.apuWizard.categories.equipment')} rows={detail.herramientas} subtotal={detail.herramientasSubtotal} />
      <ApuSection title={t('execution.budget.items.apuWizard.categories.materials')} rows={detail.materiales} subtotal={detail.materialesSubtotal} />
      <ApuSection title={t('execution.budget.items.apuWizard.categories.labor')} rows={detail.personal.map((p) => ({ description: p.description, unit: '-', vUnit: p.jornal, parcial: p.parcial }))} subtotal={detail.personalSubtotal} />
      <ApuSection title={t('execution.budget.items.apuWizard.categories.transport')} rows={detail.transporte.map((tr) => ({ description: tr.description, unit: '-', vUnit: tr.vUnit, parcial: tr.parcial }))} subtotal={detail.transporteSubtotal} />
      <div className="border-t pt-2 flex justify-between font-medium">
        <span>{t('execution.budget.items.apuWizard.directCost')}</span>
        <span>{money(detail.directCost)}</span>
      </div>
      <div className="flex justify-between text-gray-600">
        <span>{t('execution.budget.items.apuWizard.aiuApplied', { percent: detail.aiu.aiuPercent })}</span>
        <span>{money(detail.aiu.aiuAmount)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>{t('execution.budget.items.apuWizard.totalWithAiu')}</span>
        <span>{money(detail.totalWithAiu)}</span>
      </div>
    </div>
  );
}

function ApuSection({ title, rows, subtotal }) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b">
              <th className="py-1 pr-2">{t('execution.budget.items.apuWizard.resourceName')}</th>
              <th className="py-1 pr-2">{t('execution.budget.items.unit')}</th>
              <th className="py-1 pr-2 text-right">{t('execution.budget.items.unitValue')}</th>
              <th className="py-1 pr-2 text-right">{t('execution.budget.items.table.total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1 pr-2">{r.description}</td>
                <td className="py-1 pr-2">{r.unit}</td>
                <td className="py-1 pr-2 text-right">{money(r.vUnit)}</td>
                <td className="py-1 pr-2 text-right">{money(r.parcial)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-right text-xs font-medium mt-1">{t('execution.budget.items.apuWizard.sectionSubtotal', { amount: money(subtotal) })}</p>
    </div>
  );
}
