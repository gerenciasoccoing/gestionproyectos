import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { quotationsApi, apuApi } from '../../api';
import { Card, Button, Input, SearchSelect, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

export default function QuotationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [apus, setApus] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ apuId: '', description: '', notes: '', unit: '', quantity: '' });
  const [aiuForm, setAiuForm] = useState(null);
  const [aiuSaved, setAiuSaved] = useState(false);
  const [error, setError] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [editingQtyId, setEditingQtyId] = useState(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [qtyError, setQtyError] = useState('');
  const [savingQty, setSavingQty] = useState(false);

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

  if (!data) return <div className="text-gray-500">{t('common.loading')}</div>;
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

  const [submitItem, submittingItem] = useSubmitGuard(async (e) => {
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
  });

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

  const startEditQty = (it) => {
    setEditingQtyId(it.id);
    setQtyDraft(String(it.quantity));
    setQtyError('');
  };

  const saveQty = async (it) => {
    setQtyError('');
    setSavingQty(true);
    try {
      await quotationsApi.updateItem(id, it.id, { quantity: qtyDraft });
      setEditingQtyId(null);
      load();
    } catch (err) {
      setQtyError(extractError(err));
    } finally {
      setSavingQty(false);
    }
  };

  const removeItem = async (itemId) => {
    if (!confirm(t('quotations.detail.confirmRemoveItem'))) return;
    await quotationsApi.removeItem(id, itemId);
    load();
  };

  const convert = async () => {
    if (!confirm(t('quotations.detail.confirmConvert'))) return;
    try {
      const project = await quotationsApi.convert(id);
      navigate(`/projects/${project.id}/contractual`);
    } catch (err) {
      setError(extractError(err));
    }
  };

  const startEditName = () => {
    setNameDraft(quotation.projectNameProposed);
    setNameError('');
    setEditingName(true);
  };

  const saveName = async (e) => {
    e.preventDefault();
    setNameError('');
    setSavingName(true);
    try {
      await quotationsApi.update(id, { projectNameProposed: nameDraft.trim() });
      setEditingName(false);
      load();
    } catch (err) {
      setNameError(extractError(err));
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div>
      <Link to="/quotations" className="text-sm text-blue-600 hover:underline">{t('quotations.detail.back')}</Link>
      {editingName ? (
        <form onSubmit={saveName} className="flex items-center flex-wrap gap-2 mt-2 mb-1">
          <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} required autoFocus className="max-w-sm" />
          <Button type="submit" disabled={savingName}>{t('common.save')}</Button>
          <Button type="button" variant="secondary" onClick={() => setEditingName(false)}>{t('common.cancel')}</Button>
        </form>
      ) : (
        <div className="flex items-center gap-3 mt-2 mb-1">
          <h1 className="text-xl font-bold">{quotation.projectNameProposed}</h1>
          <Badge color={isConverted ? 'green' : 'gray'}>{t(`enums.quotationStatus.${quotation.status}`, quotation.status)}</Badge>
          {!isConverted && (
            <Can module="cotizaciones" action="edit">
              <Button variant="secondary" onClick={startEditName}>{t('common.edit')}</Button>
            </Can>
          )}
        </div>
      )}
      {editingName && <ErrorText>{nameError}</ErrorText>}
      <div className="mb-4" />

      <Card title={t('quotations.detail.data')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div><span className="text-gray-500">{t('quotations.detail.client')}:</span> {quotation.clientName}</div>
          <div><span className="text-gray-500">{t('quotations.detail.date')}:</span> {formatDate(quotation.date)}</div>
          <div><span className="text-gray-500">{t('quotations.detail.validity')}:</span> {quotation.validityDays} {t('quotations.detail.days')}</div>
          <div><span className="text-gray-500">{t('quotations.detail.conditions')}:</span> {quotation.paymentTerms || '-'}</div>
        </div>
      </Card>

      {aiuForm && (
        <Card title={t('quotations.detail.aiuTitle')}>
          <form onSubmit={submitAiu} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <Input
              label={t('quotations.detail.admin')} type="number" min="0" step="0.01"
              value={aiuForm.adminPercent} onChange={(e) => setAiuForm({ ...aiuForm, adminPercent: e.target.value })}
              disabled={isConverted}
            />
            <Input
              label={t('quotations.detail.unforeseen')} type="number" min="0" step="0.01"
              value={aiuForm.imprevistosPercent} onChange={(e) => setAiuForm({ ...aiuForm, imprevistosPercent: e.target.value })}
              disabled={isConverted}
            />
            <Input
              label={t('quotations.detail.profit')} type="number" min="0" step="0.01"
              value={aiuForm.utilidadPercent} onChange={(e) => setAiuForm({ ...aiuForm, utilidadPercent: e.target.value })}
              disabled={isConverted}
            />
            {!isConverted && (
              <Can module="cotizaciones" action="edit">
                <div className="col-span-full flex items-center gap-3">
                  <Button type="submit">{t('quotations.detail.saveAiu')}</Button>
                  <p className="text-xs text-gray-400">{t('quotations.detail.aiuNote')}</p>
                  {aiuSaved && <p className="text-sm text-green-600">{t('quotations.detail.saved')}</p>}
                </div>
              </Can>
            )}
          </form>
        </Card>
      )}

      <Card title={t('quotations.detail.budgetTitle')} actions={
        !isConverted && (
          <Can module="cotizaciones" action="edit">
            <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('quotations.detail.addItem')}</Button>
          </Can>
        )
      }>
        {showForm && (
          <form onSubmit={submitItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <SearchSelect
              label={t('quotations.detail.apuSearch')}
              options={apus.map((a) => ({ value: a.id, label: `${a.code ? `${a.code} - ` : ''}${a.name} (${money(a.unitCost)}/${a.unit})` }))}
              value={form.apuId}
              onChange={onApuChange}
              placeholder={t('quotations.detail.manualPlaceholder')}
            />
            {form.apuId ? (
              <Input label={t('quotations.detail.descriptionFromApu')} value={form.description} disabled />
            ) : (
              <Input label={t('quotations.detail.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
            )}
            <Input label={t('quotations.detail.note')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <Input label={t('quotations.detail.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required />
            <Input label={t('quotations.detail.quantity')} type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            <Button type="submit" className="col-span-full" loading={submittingItem}>{t('quotations.detail.add')}</Button>
            <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
          </form>
        )}
        <Table columns={[t('quotations.detail.table.code'), t('quotations.detail.table.description'), t('quotations.detail.table.unit'), t('quotations.detail.table.quantity'), t('quotations.detail.table.unitValue'), t('quotations.detail.table.total'), '']}>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-1 pr-3 text-gray-400">{it.APU?.code || '-'}</td>
              <td className="py-1 pr-3">
                {it.description}
                {it.notes && <div className="text-xs text-gray-400">{t('quotations.detail.noteLabel')}: {it.notes}</div>}
              </td>
              <td className="py-1 pr-3">{it.unit}</td>
              <td className="py-1 pr-3">
                {editingQtyId === it.id ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" min="0" step="0.01" value={qtyDraft} onChange={(e) => setQtyDraft(e.target.value)} className="w-24" autoFocus />
                    <Button variant="secondary" disabled={savingQty} onClick={() => saveQty(it)}>{t('common.save')}</Button>
                    <Button variant="ghost" onClick={() => setEditingQtyId(null)}>{t('common.cancel')}</Button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    {Number(it.quantity)}
                    {!isConverted && (
                      <Can module="cotizaciones" action="edit">
                        <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => startEditQty(it)}>{t('common.edit')}</button>
                      </Can>
                    )}
                  </span>
                )}
              </td>
              <td className="py-1 pr-3">{money(it.unitCost)}</td>
              <td className="py-1 pr-3">{money(it.totalCost)}</td>
              <td className="py-1 pr-3 text-right">
                {!isConverted && (
                  <Can module="cotizaciones" action="edit"><Button variant="danger" onClick={() => removeItem(it.id)}>{t('quotations.detail.remove')}</Button></Can>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={7} className="py-2 text-center text-gray-400">{t('quotations.detail.empty')}</td></tr>}
        </Table>
        <ErrorText>{qtyError}</ErrorText>
        <p className="text-right font-bold mt-2">{t('quotations.detail.total')}: {money(total)}</p>
      </Card>

      {budget && items.length > 0 && (
        <Card title={t('quotations.detail.exportTitle')} actions={
          <Button onClick={() => setShowExport((s) => !s)}>{showExport ? t('common.cancel') : t('quotations.detail.exportToggle')}</Button>
        }>
          {showExport && (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                {t('quotations.detail.exportHelp')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input label={t('quotations.detail.elaborated')} value={exportNames.elaboroNombre} onChange={(e) => setExportNames({ ...exportNames, elaboroNombre: e.target.value })} />
                <Input label={t('quotations.detail.reviewed')} value={exportNames.revisoNombre} onChange={(e) => setExportNames({ ...exportNames, revisoNombre: e.target.value })} />
              </div>
              <div className="flex gap-2 items-center">
                <Button onClick={() => downloadExport('pdf')} disabled={!!exportDownloading}>
                  {exportDownloading === 'pdf' ? t('quotations.detail.generatingPdf') : t('common.downloadPdf')}
                </Button>
                <Button variant="secondary" onClick={() => downloadExport('excel')} disabled={!!exportDownloading}>
                  {exportDownloading === 'excel' ? t('quotations.detail.generatingExcel') : t('common.downloadExcel')}
                </Button>
              </div>
              <ErrorText>{exportError}</ErrorText>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <a href={quotationsApi.pdfUrl(id)} target="_blank" rel="noreferrer">
          <Button variant="secondary">{t('quotations.detail.generateProposalPdf')}</Button>
        </a>
        {!isConverted && (
          <Can module="cotizaciones" action="edit">
            <Button onClick={convert}>{t('quotations.detail.convert')}</Button>
          </Can>
        )}
        {isConverted && quotation.convertedProjectId && (
          <Link to={`/projects/${quotation.convertedProjectId}/contractual`}>
            <Button variant="secondary">{t('quotations.detail.goToProject')}</Button>
          </Link>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
