import { useEffect, useState } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marketStudiesApi, thirdPartiesApi, cashBoxesApi } from '../../api';
import {
  Card, Button, Input, Select, SearchSelect, Table, Badge, ErrorText, extractError, money, formatDate,
} from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

function emptyItem() { return { name: '', unit: '', quantity: '', unitPrice: '', groupKey: '', needsReview: false }; }

export default function MarketStudyDetailPage() {
  const { t } = useTranslation();
  const outletCtx = useOutletContext();
  const projectId = outletCtx?.projectId;
  const { studyId } = useParams();

  const [study, setStudy] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [error, setError] = useState('');

  const load = () => marketStudiesApi.get(projectId, studyId).then(setStudy);
  const loadComparison = () => marketStudiesApi.comparison(projectId, studyId).then(setComparison).catch(() => setComparison(null));
  useEffect(() => { load(); }, [projectId, studyId]);
  useEffect(() => { if (study) loadComparison(); }, [study?.quotations?.length]);
  useEffect(() => {
    thirdPartiesApi.list({ type: 'proveedor' }).then(setSuppliers);
    cashBoxesApi.list().then(setCashBoxes);
  }, []);

  const removeQuotation = async (quotationId) => {
    if (!confirm(t('marketStudy.confirmDeleteQuotation'))) return;
    setError('');
    try {
      await marketStudiesApi.removeQuotation(projectId, studyId, quotationId);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  if (!study) return <div className="text-gray-500">{t('common.loading')}</div>;
  const isDecided = study.status === 'decidida';

  return (
    <div className="space-y-4">
      <Card title={study.title} actions={<Badge color={isDecided ? 'green' : 'yellow'}>{t(`marketStudy.status.${study.status}`, study.status)}</Badge>}>
        <div className="text-sm text-gray-500 flex flex-wrap gap-4">
          {study.Project && <span>{t('marketStudy.project')}: {study.Project.name}</span>}
          {study.BudgetItem && <span>{t('marketStudy.budgetItem')}: {study.BudgetItem.description}</span>}
          <span>{t('marketStudy.table.created')}: {formatDate(study.createdAt)}</span>
        </div>
        {isDecided && study.draftOrders?.length > 0 && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm text-green-800">
            <p className="font-medium mb-1">{t('marketStudy.decidedNote')}</p>
            <ul className="list-disc list-inside">
              {study.draftOrders.map((o) => (
                <li key={o.id}>
                  {o.supplier} — {o.orderNumber ? `${o.contractPrefix ? `${o.contractPrefix}-` : ''}${o.orderNumber}` : o.id.slice(0, 8)}
                  {' '}<Badge color={o.approvalState === 'aprobada' ? 'green' : o.approvalState === 'rechazada' ? 'red' : 'yellow'}>
                    {t(`execution.purchaseOrders.approvalState.${o.approvalState || 'aprobada'}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card title={t('marketStudy.quotationsTitle')}>
        <Table columns={[t('marketStudy.table.supplier'), t('marketStudy.table.items'), t('marketStudy.deliveryTime'), t('marketStudy.validUntil'), t('marketStudy.extractionStatus'), '']}>
          {study.quotations.map((q) => (
            <tr key={q.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">{q.supplierParty?.name || q.supplierNameRaw}</td>
              <td className="py-2 pr-3">{q.items?.length || 0}</td>
              <td className="py-2 pr-3">{q.deliveryTime || '-'}</td>
              <td className="py-2 pr-3">{q.validUntil ? formatDate(q.validUntil) : '-'}</td>
              <td className="py-2 pr-3">
                <Badge color={q.extractionStatus === 'revisar' ? 'yellow' : 'green'}>
                  {t(`marketStudy.extraction.${q.extractionStatus}`, q.extractionStatus)}
                </Badge>
              </td>
              <td className="py-2 pr-3 text-right">
                {!isDecided && (
                  <Can module="estudio_mercado" action="delete">
                    <Button variant="danger" onClick={() => removeQuotation(q.id)}>{t('common.delete')}</Button>
                  </Can>
                )}
              </td>
            </tr>
          ))}
          {study.quotations.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('marketStudy.noQuotations')}</td></tr>}
        </Table>

        {!isDecided && (
          <Can module="estudio_mercado" action="create">
            <AddQuotationForm projectId={projectId} studyId={studyId} suppliers={suppliers} onAdded={load} />
          </Can>
        )}
      </Card>

      {comparison && comparison.groups.length > 0 && (
        <Card title={t('marketStudy.comparisonTitle')}>
          {comparison.recommendation.isSplitRecommended && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm text-blue-800">
              <p className="font-medium">{t('marketStudy.splitSuggested')}</p>
              <ul className="list-disc list-inside">
                {comparison.recommendation.splitByGroup.map((g) => (
                  <li key={g.groupKey}>
                    {g.name}: {g.bestQuotationIds.map((qid) => comparison.suppliers.find((s) => s.quotationId === qid)?.supplierName).join(', ') || t('marketStudy.noOffer')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-2 pr-3">{t('marketStudy.item')}</th>
                  {comparison.suppliers.map((s) => (
                    <th key={s.quotationId} className="text-left py-2 pr-3">{s.supplierName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.groups.map((g) => (
                  <tr key={g.groupKey} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{g.name} {g.unit ? `(${g.unit})` : ''}</td>
                    {comparison.suppliers.map((s) => {
                      const offer = g.offers.find((o) => o.quotationId === s.quotationId);
                      const isBest = offer && g.bestQuotationIds.includes(offer.quotationId);
                      return (
                        <td key={s.quotationId} className={`py-2 pr-3 ${isBest ? 'bg-green-50 font-semibold text-green-800' : ''}`}>
                          {offer ? (offer.unitPrice != null ? money(offer.unitPrice) : t('marketStudy.needsReview')) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-gray-300">
                  <td className="py-2 pr-3">{t('marketStudy.supplierTotal')}</td>
                  {comparison.suppliers.map((s) => {
                    const isBest = comparison.recommendation.bestTotalQuotationIds.includes(s.quotationId);
                    return (
                      <td key={s.quotationId} className={`py-2 pr-3 ${isBest ? 'bg-green-50 text-green-800' : ''}`}>
                        {s.itemCount > 0 ? money(s.total) : '-'}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!isDecided && study.quotations.length > 0 && (
        <Can module="ordenes_compra" action="create">
          <GenerateDraftSection
            projectId={projectId}
            studyId={studyId}
            study={study}
            comparison={comparison}
            cashBoxes={cashBoxes}
            onDecided={load}
          />
        </Can>
      )}
    </div>
  );
}

function AddQuotationForm({ projectId, studyId, suppliers, onAdded }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [form, setForm] = useState({ supplierId: '', supplierNameRaw: '', deliveryTime: '', validUntil: '', paymentTerms: '' });
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const scanFile = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    setScanNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await marketStudiesApi.scanQuotation(projectId, studyId, fd);
      const matchedSupplier = result.supplierName
        ? suppliers.find((s) => s.name.trim().toLowerCase() === result.supplierName.trim().toLowerCase())
        : null;
      setForm({
        supplierId: matchedSupplier?.id || '',
        supplierNameRaw: result.supplierName || '',
        deliveryTime: result.deliveryTime || '',
        validUntil: result.validUntil || '',
        paymentTerms: result.paymentTerms || '',
      });
      setItems((result.items || []).map((it) => ({
        name: it.name || '', unit: it.unit || '', quantity: it.quantity ?? '', unitPrice: it.unitPrice ?? '',
        groupKey: it.groupKey || it.name || '', needsReview: !!it.needsReview,
      })));
      setScanNotice(t('marketStudy.scanDone'));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

  const updateItem = (idx, field, value) => setItems((its) => {
    const next = [...its];
    next[idx] = { ...next[idx], [field]: value };
    return next;
  });
  const addRow = () => setItems((its) => [...its, emptyItem()]);
  const removeRow = (idx) => setItems((its) => its.filter((_, i) => i !== idx));

  const pickSupplier = (supplierId) => {
    const s = suppliers.find((x) => x.id === supplierId);
    setForm((f) => ({ ...f, supplierId, supplierNameRaw: s ? s.name : f.supplierNameRaw }));
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    if (!form.supplierNameRaw.trim()) { setError(t('marketStudy.supplierRequired')); return; }
    if (items.length === 0 || items.every((it) => !it.name.trim())) { setError(t('marketStudy.itemsRequired')); return; }
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('supplierId', form.supplierId);
      fd.append('supplierNameRaw', form.supplierNameRaw);
      fd.append('deliveryTime', form.deliveryTime);
      fd.append('validUntil', form.validUntil);
      fd.append('paymentTerms', form.paymentTerms);
      fd.append('extractionStatus', items.some((it) => it.needsReview || !it.quantity || !it.unitPrice) ? 'revisar' : 'ok');
      fd.append('items', JSON.stringify(items.filter((it) => it.name.trim())));
      await marketStudiesApi.addQuotation(projectId, studyId, fd);
      setFile(null);
      setForm({ supplierId: '', supplierNameRaw: '', deliveryTime: '', validUntil: '', paymentTerms: '' });
      setItems([]);
      setScanNotice('');
      onAdded();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <form onSubmit={submit} className="mt-4 border-t pt-4">
      <p className="text-sm font-medium text-gray-700 mb-2">{t('marketStudy.addQuotation')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2 items-end">
        <Input label={t('marketStudy.file')} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
        <Button type="button" variant="secondary" disabled={!file || scanning} onClick={scanFile}>
          {scanning ? t('marketStudy.reading') : t('marketStudy.readAuto')}
        </Button>
      </div>
      {scanNotice && <p className="text-sm text-green-700 mb-2">{scanNotice}</p>}
      <p className="text-xs text-gray-400 mb-3">{t('marketStudy.scanNote')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <SearchSelect
          label={t('marketStudy.registeredSupplier')}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          value={form.supplierId}
          onChange={pickSupplier}
          placeholder={t('marketStudy.newSupplierPlaceholder')}
        />
        <Input label={t('marketStudy.supplierName')} value={form.supplierNameRaw} onChange={(e) => setForm({ ...form, supplierNameRaw: e.target.value, supplierId: '' })} required />
        <Input label={t('marketStudy.deliveryTime')} value={form.deliveryTime} onChange={(e) => setForm({ ...form, deliveryTime: e.target.value })} />
        <Input label={t('marketStudy.validUntil')} type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        <Input label={t('marketStudy.paymentTerms')} value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className="sm:col-span-2 lg:col-span-4" />
      </div>

      {!form.supplierId && form.supplierNameRaw && (
        <p className="text-xs text-yellow-700 mb-3">
          {t('marketStudy.noLinkedSupplierNote')} <Link to="/suppliers" target="_blank" className="underline">{t('marketStudy.createSupplierLink')}</Link>
        </p>
      )}

      <p className="text-sm font-medium text-gray-600 mb-2">{t('marketStudy.items')}</p>
      {items.map((it, idx) => (
        <div key={idx} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mb-2 items-end">
          <Input label={t('marketStudy.itemName')} value={it.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} required className="lg:col-span-2" />
          <Input label={t('execution.purchaseOrders.unit')} value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} />
          <Input label={t('execution.purchaseOrders.orderedQty')} type="number" min="0" step="0.01" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
          <Input label={t('execution.purchaseOrders.unitValue')} type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} />
          <Input label={t('marketStudy.groupKey')} value={it.groupKey} onChange={(e) => updateItem(idx, 'groupKey', e.target.value)} title={t('marketStudy.groupKeyHint')} />
          <Button type="button" variant="danger" onClick={() => removeRow(idx)}>{t('execution.purchaseOrders.removeRow')}</Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={addRow}>{t('execution.purchaseOrders.addRow')}</Button>
      <Button type="submit" className="ml-2" loading={submitting}>{t('common.save')}</Button>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function GenerateDraftSection({ projectId, studyId, study, comparison, cashBoxes, onDecided }) {
  const { t } = useTranslation();
  const cashBoxOptions = cashBoxes.filter((cb) => cb.status === 'activa');
  const [selected, setSelected] = useState({}); // quotationId -> { checked, itemIds:Set, cashBoxId, date, retentionPercent }
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!comparison) return;
    const bestByQuotation = new Set(comparison.recommendation.bestTotalQuotationIds);
    const next = {};
    for (const q of study.quotations) {
      const preselect = comparison.recommendation.isSplitRecommended
        ? comparison.groups.some((g) => g.bestQuotationIds.includes(q.id))
        : bestByQuotation.has(q.id);
      const preselectedItemIds = comparison.recommendation.isSplitRecommended
        ? new Set(comparison.groups.filter((g) => g.bestQuotationIds.includes(q.id)).flatMap((g) => g.offers.filter((o) => o.quotationId === q.id).map((o) => o.itemId)))
        : new Set(q.items.map((it) => it.id));
      next[q.id] = {
        checked: preselect,
        itemIds: preselectedItemIds,
        cashBoxId: '',
        date: new Date().toISOString().slice(0, 10),
        retentionPercent: 0,
      };
    }
    setSelected(next);
  }, [comparison, study.quotations]);

  const toggleSupplier = (qid) => setSelected((s) => ({ ...s, [qid]: { ...s[qid], checked: !s[qid].checked } }));
  const toggleItem = (qid, itemId) => setSelected((s) => {
    const set = new Set(s[qid].itemIds);
    if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
    return { ...s, [qid]: { ...s[qid], itemIds: set } };
  });
  const updateField = (qid, field, value) => setSelected((s) => ({ ...s, [qid]: { ...s[qid], [field]: value } }));

  const [submit, submitting] = useSubmitGuard(async () => {
    setError('');
    setResult(null);
    const drafts = study.quotations
      .filter((q) => selected[q.id]?.checked)
      .map((q) => ({
        supplierId: q.supplierId || undefined,
        supplierName: q.supplierParty?.name || q.supplierNameRaw,
        cashBoxId: selected[q.id].cashBoxId,
        date: selected[q.id].date,
        retentionPercent: selected[q.id].retentionPercent,
        itemIds: [...selected[q.id].itemIds],
      }));
    if (drafts.length === 0) { setError(t('marketStudy.selectAtLeastOneSupplier')); return; }
    if (drafts.some((d) => !d.cashBoxId)) { setError(t('expenses.cashBoxRequired')); return; }
    try {
      const res = await marketStudiesApi.generateDraft(projectId, studyId, { drafts });
      setResult(res.orders);
      onDecided();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card title={t('marketStudy.generateDraftTitle')}>
      <p className="text-sm text-gray-500 mb-3">{t('marketStudy.generateDraftHint')}</p>
      {study.quotations.map((q) => {
        const sel = selected[q.id];
        if (!sel) return null;
        return (
          <div key={q.id} className="border rounded p-3 mb-3">
            <label className="flex items-center gap-2 font-medium mb-2">
              <input type="checkbox" checked={sel.checked} onChange={() => toggleSupplier(q.id)} />
              {q.supplierParty?.name || q.supplierNameRaw}
            </label>
            {sel.checked && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <Input label={t('execution.purchaseOrders.date')} type="date" value={sel.date} onChange={(e) => updateField(q.id, 'date', e.target.value)} />
                  <Select label={t('expenses.cashBox')} value={sel.cashBoxId} onChange={(e) => updateField(q.id, 'cashBoxId', e.target.value)} required>
                    <option value="">{t('common.selectPlaceholder')}</option>
                    {cashBoxOptions.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({money(cb.balance)})</option>)}
                  </Select>
                  <Input label={t('execution.purchaseOrders.retentionPercent')} type="number" min="0" max="100" step="0.01" value={sel.retentionPercent} onChange={(e) => updateField(q.id, 'retentionPercent', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  {q.items.map((it) => (
                    <label key={it.id} className="text-sm flex items-center gap-2">
                      <input type="checkbox" checked={sel.itemIds.has(it.id)} onChange={() => toggleItem(q.id, it.id)} />
                      {it.name} — {it.quantity ?? '-'} {it.unit} × {it.unitPrice != null ? money(it.unitPrice) : '-'}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button onClick={submit} loading={submitting}>{t('marketStudy.confirmGenerateDraft')}</Button>
      <ErrorText>{error}</ErrorText>
      {result && (
        <p className="text-sm text-green-700 mt-2">
          {t('marketStudy.draftGenerated', { count: result.length })}
        </p>
      )}
    </Card>
  );
}
