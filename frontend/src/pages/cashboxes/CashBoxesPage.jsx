import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cashBoxesApi, withholdingTypesApi, projectsApi, projectPaymentsApi } from '../../api';
import { Card, Button, Input, Select, SearchSelect, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import { useAuth } from '../../context/AuthContext';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', initialBalance: '' };

const emptyMovementForm = {
  projectId: '', date: '', concept: '', amount: '', grossAmount: '',
  isWithholdingReturn: false, returnsWithholdingId: '',
  withholdings: [],
};

function movementFormFromMovement(m) {
  return {
    projectId: m.projectId || '',
    date: m.date,
    concept: m.concept,
    amount: String(m.amount),
    grossAmount: m.grossAmount != null ? String(m.grossAmount) : '',
    isWithholdingReturn: Boolean(m.isWithholdingReturn),
    returnsWithholdingId: m.returnsWithholdingId || '',
    withholdings: (m.withholdings || []).map((w) => ({
      withholdingTypeId: w.withholdingTypeId || '',
      typeName: w.typeName,
      base: String(w.base),
      percent: String(w.percent),
      value: String(w.value),
      valueOverridden: true, // ya persistido: no recalcular hasta que el usuario toque algo
    })),
  };
}

// Módulo de Cajas: requisito previo de Gastos (todo gasto debe elegir una caja de origen, ver
// ExpensesPage.jsx). El saldo mostrado siempre viene del backend calculado en vivo
// (cashBoxService.getBalance), nunca se calcula aquí, para que nunca pueda desincronizarse.
export default function CashBoxesPage() {
  const { t } = useTranslation();
  const [cashBoxes, setCashBoxes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = () => cashBoxesApi.list().then(setCashBoxes);
  useEffect(() => { load(); }, []);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await cashBoxesApi.create(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const toggleStatus = async (cashBox) => {
    const nextStatus = cashBox.status === 'activa' ? 'cerrada' : 'activa';
    await cashBoxesApi.setStatus(cashBox.id, nextStatus);
    load();
  };

  return (
    <div>
      <Card title={t('cashBoxes.title')} actions={
        <Can module="cajas" action="create">
          <Button onClick={() => { setShowForm((s) => !s); if (showForm) setForm(emptyForm); }}>
            {showForm ? t('common.cancel') : t('cashBoxes.newCashBox')}
          </Button>
        </Can>
      }>
        {showForm && (
          <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Input label={t('cashBoxes.fields.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label={t('cashBoxes.fields.initialBalance')} type="number" min="0" step="0.01" value={form.initialBalance} onChange={(e) => setForm({ ...form, initialBalance: e.target.value })} required />
              <Button type="submit" loading={submitting}>{t('common.save')}</Button>
            </div>
            <ErrorText>{error}</ErrorText>
          </form>
        )}

        <Table columns={[t('cashBoxes.table.name'), t('cashBoxes.table.initialBalance'), t('cashBoxes.table.balance'), t('cashBoxes.table.status'), '']}>
          {cashBoxes.map((cb) => (
            <tr key={cb.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{cb.name}</td>
              <td className="py-1 pr-3">{money(cb.initialBalance)}</td>
              <td className={`py-1 pr-3 font-medium ${cb.balance < 0 ? 'text-red-600' : ''}`}>{money(cb.balance)}</td>
              <td className="py-1 pr-3"><Badge color={cb.status === 'activa' ? 'green' : 'gray'}>{t(`cashBoxes.status.${cb.status}`)}</Badge></td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                <Button variant="secondary" onClick={() => setExpandedId(expandedId === cb.id ? null : cb.id)}>
                  {expandedId === cb.id ? t('common.close') : t('cashBoxes.addMovement')}
                </Button>
                <Can module="cajas" action="edit">
                  <Button variant={cb.status === 'activa' ? 'danger' : 'secondary'} className="ml-2" onClick={() => toggleStatus(cb)}>
                    {cb.status === 'activa' ? t('cashBoxes.close') : t('cashBoxes.activate')}
                  </Button>
                </Can>
              </td>
            </tr>
          ))}
          {cashBoxes.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('cashBoxes.empty')}</td></tr>}
        </Table>
      </Card>

      {expandedId && <CashBoxMovements cashBoxId={expandedId} onChange={load} />}
    </div>
  );
}

function CashBoxMovements({ cashBoxId, onChange }) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [cashBox, setCashBox] = useState(null);
  const [projects, setProjects] = useState([]);
  const [withholdingTypes, setWithholdingTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyMovementForm);
  const [supportFile, setSupportFile] = useState(null);
  const [pendingReturns, setPendingReturns] = useState([]);
  const [error, setError] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [expandedMovementId, setExpandedMovementId] = useState(null);

  const load = () => cashBoxesApi.get(cashBoxId).then(setCashBox);
  useEffect(() => { load(); }, [cashBoxId]);
  useEffect(() => {
    projectsApi.list().then((all) => {
      setProjects(all.filter((p) => isAdmin || p.status !== 'terminado'));
    });
    withholdingTypesApi.list().then((types) => setWithholdingTypes(types.filter((t2) => t2.active)));
  }, [isAdmin]);

  // Retenciones recuperables pendientes del proyecto elegido (para el selector de "qué retención
  // se está devolviendo") — se recalcula cada vez que cambia el proyecto del formulario.
  useEffect(() => {
    if (!form.projectId) { setPendingReturns([]); return; }
    projectPaymentsApi.list(form.projectId).then((movements) => {
      const rows = [];
      movements.forEach((m) => {
        (m.withholdings || []).forEach((w) => {
          if (w.recoverable && !w.returned && w.id !== undefined) rows.push({ ...w, movementConcept: m.concept, movementDate: m.date });
        });
      });
      setPendingReturns(rows);
    });
  }, [form.projectId]);

  const projectOptions = useMemo(() => (
    [{ value: '', label: t('cashBoxes.movement.noProject') }].concat(
      projects.map((p) => ({ value: p.id, label: `${p.contractNumber || t('cashBoxes.movement.noContractNumber')} – ${p.name}` }))
    )
  ), [projects, t]);

  const filterProjectOptions = useMemo(() => {
    const seen = new Map();
    (cashBox?.movements || []).forEach((m) => { if (m.Project) seen.set(m.Project.id, m.Project); });
    return [...seen.values()];
  }, [cashBox]);

  const resetForm = () => {
    setForm(emptyMovementForm);
    setSupportFile(null);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const startCreate = () => { resetForm(); setShowForm(true); };
  const startEdit = (m) => {
    setForm(movementFormFromMovement(m));
    setSupportFile(null);
    setEditingId(m.id);
    setShowForm(true);
    setError('');
  };

  const grossAmountNum = Number(form.grossAmount || 0);
  const totalWithholdings = form.withholdings.reduce((s, w) => s + Number(w.value || 0), 0);
  const netAmount = grossAmountNum - totalWithholdings;

  const addWithholdingRow = () => {
    const type = withholdingTypes[0];
    setForm((f) => ({
      ...f,
      withholdings: [...f.withholdings, {
        withholdingTypeId: type?.id || '',
        typeName: type?.name || '',
        base: f.grossAmount || '0',
        percent: type ? String(type.defaultPercent) : '0',
        value: type ? String(Math.round((Number(f.grossAmount || 0) * Number(type.defaultPercent)) / 100)) : '0',
        valueOverridden: false,
      }],
    }));
  };

  const removeWithholdingRow = (idx) => {
    setForm((f) => ({ ...f, withholdings: f.withholdings.filter((_, i) => i !== idx) }));
  };

  const updateWithholdingRow = (idx, patch) => {
    setForm((f) => {
      const rows = f.withholdings.map((w, i) => {
        if (i !== idx) return w;
        const next = { ...w, ...patch };
        if (patch.value !== undefined) { next.valueOverridden = true; return next; }
        if (!next.valueOverridden) {
          next.value = String(Math.round((Number(next.base || 0) * Number(next.percent || 0)) / 100));
        }
        return next;
      });
      return { ...f, withholdings: rows };
    });
  };

  const onWithholdingTypeChange = (idx, withholdingTypeId) => {
    const type = withholdingTypes.find((t2) => t2.id === withholdingTypeId);
    updateWithholdingRow(idx, {
      withholdingTypeId,
      typeName: type?.name || '',
      percent: type ? String(type.defaultPercent) : '0',
      valueOverridden: false,
    });
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      fd.append('date', form.date);
      fd.append('projectId', form.projectId || '');
      if (form.isWithholdingReturn) {
        fd.append('isWithholdingReturn', 'true');
        fd.append('returnsWithholdingId', form.returnsWithholdingId);
        fd.append('amount', form.amount);
        fd.append('concept', form.concept || t('cashBoxes.movement.returnDefaultConcept'));
      } else if (form.projectId) {
        fd.append('grossAmount', form.grossAmount);
        fd.append('concept', form.concept);
        fd.append('withholdings', JSON.stringify(form.withholdings.map((w) => ({
          withholdingTypeId: w.withholdingTypeId || undefined,
          typeName: w.typeName || undefined,
          base: w.base,
          percent: w.percent,
          value: w.value,
        }))));
      } else {
        fd.append('amount', form.amount);
        fd.append('concept', form.concept);
      }
      if (supportFile) fd.append('support', supportFile);

      if (editingId) await cashBoxesApi.updateMovement(cashBoxId, editingId, fd);
      else await cashBoxesApi.addMovement(cashBoxId, fd);
      resetForm();
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const removeMovement = async (m) => {
    if (!confirm(t('cashBoxes.movement.confirmDelete'))) return;
    setError('');
    try {
      await cashBoxesApi.removeMovement(cashBoxId, m.id);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  };

  if (!cashBox) return null;
  const canEdit = cashBox.status === 'activa';
  const visibleMovements = (cashBox.movements || []).filter((m) => !projectFilter || m.projectId === projectFilter);
  const editingMovementSupportPath = editingId ? cashBox.movements?.find((m) => m.id === editingId)?.supportFilePath : null;

  return (
    <Card title={t('cashBoxes.movementsTitle', { name: cashBox.name })} actions={
      canEdit && (
        <Can module="cajas" action="edit">
          <Button onClick={() => (showForm ? resetForm() : startCreate())}>
            {showForm ? t('common.cancel') : t('cashBoxes.registerIncome')}
          </Button>
        </Can>
      )
    }>
      {showForm && (
        <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <SearchSelect
              label={t('cashBoxes.movement.project')}
              options={projectOptions}
              value={form.projectId}
              onChange={(v) => setForm((f) => ({ ...f, projectId: v, isWithholdingReturn: false, returnsWithholdingId: '' }))}
              placeholder={t('cashBoxes.movement.noProject')}
            />
            <Input label={t('cashBoxes.fields.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>

          {form.projectId && pendingReturns.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isWithholdingReturn}
                onChange={(e) => setForm((f) => ({ ...f, isWithholdingReturn: e.target.checked, returnsWithholdingId: '' }))}
              />
              {t('cashBoxes.movement.isReturn')}
            </label>
          )}

          {form.projectId && form.isWithholdingReturn ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <Select
                label={t('cashBoxes.movement.returnWhich')}
                value={form.returnsWithholdingId}
                onChange={(e) => {
                  const wh = pendingReturns.find((w) => w.id === e.target.value);
                  setForm((f) => ({ ...f, returnsWithholdingId: e.target.value, amount: wh ? String(wh.value) : f.amount }));
                }}
                required
              >
                <option value="">{t('common.selectPlaceholder')}</option>
                {pendingReturns.map((w) => (
                  <option key={w.id} value={w.id}>{`${w.typeName} — ${money(w.value)} (${w.movementConcept}, ${w.movementDate})`}</option>
                ))}
              </Select>
              <Input label={t('cashBoxes.movement.returnAmount')} type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
          ) : form.projectId ? (
            <div className="space-y-3">
              <Input label={t('cashBoxes.movement.grossAmount')} type="number" min="0.01" step="0.01" value={form.grossAmount} onChange={(e) => setForm((f) => ({ ...f, grossAmount: e.target.value }))} required />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-700">{t('cashBoxes.movement.withholdings')}</p>
                  <Button type="button" variant="secondary" onClick={addWithholdingRow}>{t('cashBoxes.movement.addWithholding')}</Button>
                </div>
                {form.withholdings.map((w, idx) => (
                  <div key={idx} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end mb-2 border-b pb-2">
                    <Select label={t('cashBoxes.movement.withholdingType')} value={w.withholdingTypeId} onChange={(e) => onWithholdingTypeChange(idx, e.target.value)}>
                      <option value="">{t('common.selectPlaceholder')}</option>
                      {withholdingTypes.map((t2) => <option key={t2.id} value={t2.id}>{t2.name}</option>)}
                    </Select>
                    <Input label={t('cashBoxes.movement.base')} type="number" min="0" step="0.01" value={w.base} onChange={(e) => updateWithholdingRow(idx, { base: e.target.value })} />
                    <Input label={t('cashBoxes.movement.percent')} type="number" min="0" max="100" step="0.001" value={w.percent} onChange={(e) => updateWithholdingRow(idx, { percent: e.target.value })} />
                    <Input label={t('cashBoxes.movement.value')} type="number" min="0" step="0.01" value={w.value} onChange={(e) => updateWithholdingRow(idx, { value: e.target.value })} />
                    <Button type="button" variant="danger" onClick={() => removeWithholdingRow(idx)}>{t('common.delete')}</Button>
                  </div>
                ))}
                {form.withholdings.length === 0 && <p className="text-xs text-gray-400">{t('cashBoxes.movement.noWithholdings')}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm bg-white border rounded p-2">
                <div><span className="text-gray-500">{t('cashBoxes.movement.grossAmount')}:</span> <span className="font-medium">{money(grossAmountNum)}</span></div>
                <div><span className="text-gray-500">{t('cashBoxes.movement.totalWithholdings')}:</span> <span className="font-medium">{money(totalWithholdings)}</span></div>
                <div><span className="text-gray-500">{t('cashBoxes.movement.netAmount')}:</span> <span className={`font-semibold ${netAmount < 0 ? 'text-red-600' : ''}`}>{money(netAmount)}</span></div>
              </div>
              {netAmount < 0 && <ErrorText>{t('cashBoxes.movement.withholdingsExceedGross')}</ErrorText>}
            </div>
          ) : (
            <Input label={t('cashBoxes.fields.amount')} type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          )}

          {!form.isWithholdingReturn && (
            <Input label={t('cashBoxes.fields.concept')} value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required />
          )}

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">{t('cashBoxes.movement.support')}</p>
            {editingId && !supportFile && editingMovementSupportPath && (
              <a className="text-sm text-blue-600 hover:underline block mb-1" href={fileUrl(editingMovementSupportPath)} target="_blank" rel="noreferrer">
                {t('cashBoxes.movement.viewCurrentSupport')}
              </a>
            )}
            {supportFile && <p className="text-xs text-gray-500 mb-1">{supportFile.name}</p>}
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setSupportFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-gray-400">{t('cashBoxes.movement.supportHelp')}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" loading={submitting}>{editingId ? t('common.save') : t('cashBoxes.registerIncome')}</Button>
            <Button type="button" variant="secondary" onClick={resetForm}>{t('common.cancel')}</Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </form>
      )}
      {!showForm && <ErrorText>{error}</ErrorText>}

      {filterProjectOptions.length > 0 && (
        <div className="mb-2">
          <Select label={t('cashBoxes.movement.filterByProject')} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="max-w-xs">
            <option value="">{t('cashBoxes.movement.allProjects')}</option>
            {filterProjectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      )}

      <Table columns={[t('cashBoxes.table.date'), t('cashBoxes.table.concept'), t('cashBoxes.movement.project'), t('cashBoxes.table.amount'), t('cashBoxes.movement.support'), '']}>
        {visibleMovements.map((m) => (
          <MovementRow
            key={m.id}
            m={m}
            expanded={expandedMovementId === m.id}
            onToggle={() => setExpandedMovementId(expandedMovementId === m.id ? null : m.id)}
            canEdit={canEdit}
            onEdit={() => startEdit(m)}
            onRemove={() => removeMovement(m)}
          />
        ))}
        {visibleMovements.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('cashBoxes.noMovements')}</td></tr>}
      </Table>
    </Card>
  );
}

function MovementRow({ m, expanded, onToggle, canEdit, onEdit, onRemove }) {
  const { t } = useTranslation();
  const hasWithholdings = m.withholdings && m.withholdings.length > 0;
  return (
    <>
      <tr className="border-b border-gray-100">
        <td className="py-1 pr-3">{formatDate(m.date)}</td>
        <td className="py-1 pr-3">
          {m.concept}
          {m.isWithholdingReturn && <span className="ml-1"><Badge color="blue">{t('cashBoxes.movement.returnBadge')}</Badge></span>}
        </td>
        <td className="py-1 pr-3">
          {m.Project ? (
            <>
              {m.Project.contractNumber ? `${m.Project.contractNumber} – ` : ''}{m.Project.name}
              {hasWithholdings && (
                <button type="button" className="text-blue-600 hover:underline text-xs ml-2" onClick={onToggle}>
                  {expanded ? t('cashBoxes.movement.hideWithholdings') : t('cashBoxes.movement.viewWithholdings')}
                </button>
              )}
            </>
          ) : '-'}
        </td>
        <td className="py-1 pr-3 font-medium">{money(m.amount)}</td>
        <td className="py-1 pr-3">
          {m.supportFilePath ? (
            <a href={fileUrl(m.supportFilePath)} target="_blank" rel="noreferrer" title={t('cashBoxes.movement.viewCurrentSupport')}>📎</a>
          ) : '-'}
        </td>
        <td className="py-1 pr-3 text-right whitespace-nowrap">
          {canEdit && (
            <Can module="cajas" action="edit">
              <button type="button" className="text-blue-600 hover:underline text-xs" onClick={onEdit}>{t('common.edit')}</button>
              <button type="button" className="text-red-600 hover:underline text-xs ml-2" onClick={onRemove}>{t('common.delete')}</button>
            </Can>
          )}
        </td>
      </tr>
      {expanded && hasWithholdings && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="py-2 px-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pr-2 py-1">{t('cashBoxes.movement.withholdingType')}</th>
                  <th className="pr-2 py-1">{t('cashBoxes.movement.base')}</th>
                  <th className="pr-2 py-1">{t('cashBoxes.movement.percent')}</th>
                  <th className="pr-2 py-1">{t('cashBoxes.movement.value')}</th>
                  <th className="pr-2 py-1">{t('cashBoxes.movement.recoverableStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {m.withholdings.map((w) => (
                  <tr key={w.id}>
                    <td className="pr-2 py-1">{w.typeName}</td>
                    <td className="pr-2 py-1">{money(w.base)}</td>
                    <td className="pr-2 py-1">{Number(w.percent)}%</td>
                    <td className="pr-2 py-1">{money(w.value)}</td>
                    <td className="pr-2 py-1">
                      {w.recoverable ? (w.returned ? t('cashBoxes.movement.returned') : t('cashBoxes.movement.pendingReturn')) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.grossAmount != null && (
              <p className="text-xs text-gray-500 mt-1">{t('cashBoxes.movement.grossAmount')}: {money(m.grossAmount)}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
