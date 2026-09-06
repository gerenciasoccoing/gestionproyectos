import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { budgetApi } from '../../api';
import { Button, Input, Badge, ErrorText, extractError, money } from '../../components/ui';

const CATEGORIES = [
  { key: 'materials', labelKey: 'materials' },
  { key: 'labor', labelKey: 'labor' },
  { key: 'equipment', labelKey: 'equipment' },
  { key: 'transport', labelKey: 'transport' },
];

function resourceListTotal(list) {
  return (list || []).reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unitValue || 0), 0);
}

// Modo "con APU" de Presupuesto del Proyecto: (1) escanea la lista de ítems con IA (mismo
// extractor que el modo sin APU), el usuario la revisa; (2) confirmada la lista, por cada ítem se
// escanea con IA su análisis unitario (del mismo archivo o de uno adicional para ese ítem), en
// las 4 categorías estándar (materiales/mano de obra/equipos/transporte), también editable; (3)
// un solo "Confirmar todo" crea el presupuesto completo (ítems + sus APU privados de este
// proyecto) en una sola operación — nunca toca la Base de Precios global (ver
// projectApuService.js en el backend).
export default function ProjectApuWizard({ projectId, ensureBudget, onDone, onCancel }) {
  const { t } = useTranslation();
  const [mainFile, setMainFile] = useState(null);
  const [scanningItems, setScanningItems] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [items, setItems] = useState(null);
  const [itemsConfirmed, setItemsConfirmed] = useState(false);
  const [apus, setApus] = useState({});
  const [apuFiles, setApuFiles] = useState({});
  const [scanningApuIdx, setScanningApuIdx] = useState(null);
  const [apuErrors, setApuErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const scanItems = async () => {
    if (!mainFile) return;
    setScanningItems(true);
    setItemsError('');
    try {
      const fd = new FormData();
      fd.append('file', mainFile);
      const result = await budgetApi.scanItems(projectId, fd);
      setItems(result.items.map((it) => ({
        description: it.description || '',
        unit: it.unit || '',
        quantity: it.quantity != null ? String(it.quantity) : '',
      })));
    } catch (err) {
      setItemsError(extractError(err));
    } finally {
      setScanningItems(false);
    }
  };

  const updateItemField = (idx, field, value) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const removeItemRow = (idx) => {
    setItems((list) => list.filter((_, i) => i !== idx));
    setApus((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => { if (Number(k) !== idx) next[Number(k) < idx ? k : Number(k) - 1] = v; });
      return next;
    });
  };

  const scanApuFor = async (idx) => {
    const it = items[idx];
    const file = apuFiles[idx] || mainFile;
    if (!file || !it.description) return;
    setScanningApuIdx(idx);
    setApuErrors((e) => ({ ...e, [idx]: '' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('itemDescription', it.description);
      const result = await budgetApi.scanItemApu(projectId, fd);
      setApus((prev) => ({ ...prev, [idx]: result }));
    } catch (err) {
      setApuErrors((e) => ({ ...e, [idx]: extractError(err) }));
    } finally {
      setScanningApuIdx(null);
    }
  };

  const updateResourceField = (idx, category, rIdx, field, value) => {
    setApus((prev) => {
      const apu = prev[idx];
      if (!apu) return prev;
      const list = apu[category].map((r, i) => (i === rIdx ? { ...r, [field]: value } : r));
      return { ...prev, [idx]: { ...apu, [category]: list } };
    });
  };
  const removeResourceRow = (idx, category, rIdx) => {
    setApus((prev) => {
      const apu = prev[idx];
      if (!apu) return prev;
      return { ...prev, [idx]: { ...apu, [category]: apu[category].filter((_, i) => i !== rIdx) } };
    });
  };
  const addResourceRow = (idx, category) => {
    setApus((prev) => {
      const apu = prev[idx] || { materials: [], labor: [], equipment: [], transport: [] };
      return { ...prev, [idx]: { ...apu, [category]: [...apu[category], { name: '', unit: '', quantity: '', unitValue: '' }] } };
    });
  };

  const allItemsHaveApu = items && items.length > 0 && items.every((_, idx) => {
    const apu = apus[idx];
    return apu && CATEGORIES.some((c) => (apu[c.key] || []).length > 0);
  });

  const confirmAll = async () => {
    setConfirmError('');
    setConfirming(true);
    try {
      const budget = await ensureBudget();
      const entries = items.map((it, idx) => {
        const apu = apus[idx] || { materials: [], labor: [], equipment: [], transport: [] };
        return {
          item: { unit: it.unit, quantity: it.quantity },
          apu: { name: it.description, unit: it.unit, materials: apu.materials, labor: apu.labor, equipment: apu.equipment, transport: apu.transport },
        };
      });
      await budgetApi.addItemsWithApu(projectId, budget.id, entries);
      onDone();
    } catch (err) {
      setConfirmError(extractError(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="mb-4 border rounded p-3 bg-gray-50">
      <p className="text-sm text-gray-600 mb-3">{t('execution.budget.items.apuWizard.help')}</p>

      {!items && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end mb-2">
          <Input
            label={t('execution.budget.items.apuWizard.mainFile')}
            type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
            onChange={(e) => { setMainFile(e.target.files[0]); setItemsError(''); }}
          />
          <Button type="button" disabled={!mainFile || scanningItems} onClick={scanItems}>
            {scanningItems ? t('execution.budget.items.aiScanning') : t('execution.budget.items.apuWizard.scanItems')}
          </Button>
        </div>
      )}
      <ErrorText>{itemsError}</ErrorText>

      {items && !itemsConfirmed && (
        <div className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1 pr-2">{t('execution.budget.items.table.description')}</th>
                  <th className="py-1 pr-2">{t('execution.budget.items.unit')}</th>
                  <th className="py-1 pr-2">{t('execution.budget.items.budgetedQty')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1 pr-2">
                      <input className="border border-gray-300 rounded px-2 py-1 w-64" value={it.description} onChange={(e) => updateItemField(idx, 'description', e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="border border-gray-300 rounded px-2 py-1 w-16" value={it.unit} onChange={(e) => updateItemField(idx, 'unit', e.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="border border-gray-300 rounded px-2 py-1 w-24 text-right" type="number" min="0" step="0.01" value={it.quantity} onChange={(e) => updateItemField(idx, 'quantity', e.target.value)} />
                    </td>
                    <td className="py-1 pl-2">
                      <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => removeItemRow(idx)}>{t('common.delete')}</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">{t('execution.budget.items.aiPreviewEmpty')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
            <Button disabled={items.length === 0} onClick={() => setItemsConfirmed(true)}>
              {t('execution.budget.items.apuWizard.continueToApu')}
            </Button>
          </div>
        </div>
      )}

      {items && itemsConfirmed && (
        <div className="mt-3 space-y-4">
          {items.map((it, idx) => (
            <div key={idx} className="border rounded bg-white p-3">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <p className="font-medium text-sm">{it.description} <span className="text-gray-400">({Number(it.quantity)} {it.unit})</span></p>
                {apus[idx] ? (
                  <Badge color="green">{t('execution.budget.items.apuWizard.apuLoaded')}</Badge>
                ) : (
                  <Badge color="yellow">{t('execution.budget.items.apuWizard.apuPending')}</Badge>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 mb-3">
                <Input
                  label={t('execution.budget.items.apuWizard.itemFile')}
                  type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
                  onChange={(e) => setApuFiles((f) => ({ ...f, [idx]: e.target.files[0] }))}
                />
                <p className="text-xs text-gray-400 max-w-xs">{t('execution.budget.items.apuWizard.itemFileNote')}</p>
                <Button type="button" disabled={scanningApuIdx === idx || (!apuFiles[idx] && !mainFile)} onClick={() => scanApuFor(idx)}>
                  {scanningApuIdx === idx ? t('execution.budget.items.aiScanning') : t('execution.budget.items.apuWizard.scanApu')}
                </Button>
              </div>
              <ErrorText>{apuErrors[idx]}</ErrorText>

              {apus[idx] && (
                <div className="space-y-3">
                  {CATEGORIES.map((cat) => (
                    <div key={cat.key}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-gray-600">{t(`execution.budget.items.apuWizard.categories.${cat.key}`)}</p>
                        <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => addResourceRow(idx, cat.key)}>
                          {t('execution.budget.items.apuWizard.addResource')}
                        </button>
                      </div>
                      {apus[idx][cat.key].length === 0 ? (
                        <p className="text-xs text-gray-400">{t('execution.budget.items.apuWizard.noResources')}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-400 border-b">
                                <th className="py-1 pr-2">{t('execution.budget.items.apuWizard.resourceName')}</th>
                                <th className="py-1 pr-2">{t('execution.budget.items.unit')}</th>
                                <th className="py-1 pr-2">{t('execution.budget.items.apuWizard.quantity')}</th>
                                <th className="py-1 pr-2">{t('execution.budget.items.unitValue')}</th>
                                <th className="py-1 pr-2 text-right">{t('execution.budget.items.table.total')}</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {apus[idx][cat.key].map((r, rIdx) => (
                                <tr key={rIdx} className="border-b border-gray-50">
                                  <td className="py-1 pr-2"><input className="border border-gray-300 rounded px-1 py-0.5 w-40" value={r.name} onChange={(e) => updateResourceField(idx, cat.key, rIdx, 'name', e.target.value)} /></td>
                                  <td className="py-1 pr-2"><input className="border border-gray-300 rounded px-1 py-0.5 w-14" value={r.unit || ''} onChange={(e) => updateResourceField(idx, cat.key, rIdx, 'unit', e.target.value)} /></td>
                                  <td className="py-1 pr-2"><input className="border border-gray-300 rounded px-1 py-0.5 w-20 text-right" type="number" min="0" step="0.0001" value={r.quantity} onChange={(e) => updateResourceField(idx, cat.key, rIdx, 'quantity', e.target.value)} /></td>
                                  <td className="py-1 pr-2"><input className="border border-gray-300 rounded px-1 py-0.5 w-24 text-right" type="number" min="0" step="0.01" value={r.unitValue} onChange={(e) => updateResourceField(idx, cat.key, rIdx, 'unitValue', e.target.value)} /></td>
                                  <td className="py-1 pr-2 text-right whitespace-nowrap">{money(Number(r.quantity || 0) * Number(r.unitValue || 0))}</td>
                                  <td className="py-1 pl-2"><button type="button" className="text-red-600 hover:underline" onClick={() => removeResourceRow(idx, cat.key, rIdx)}>{t('common.delete')}</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-sm font-medium text-right">
                    {t('execution.budget.items.apuWizard.apuSubtotal', { amount: money(CATEGORIES.reduce((s, c) => s + resourceListTotal(apus[idx][c.key]), 0)) })}
                  </p>
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="secondary" onClick={onCancel} disabled={confirming}>{t('common.cancel')}</Button>
            <Button disabled={!allItemsHaveApu || confirming} onClick={confirmAll}>
              {confirming ? t('execution.budget.items.apuWizard.confirming') : t('execution.budget.items.apuWizard.confirmAll')}
            </Button>
            {!allItemsHaveApu && <p className="text-xs text-yellow-700">{t('execution.budget.items.apuWizard.needAllApu')}</p>}
          </div>
          <ErrorText>{confirmError}</ErrorText>
        </div>
      )}
    </div>
  );
}
