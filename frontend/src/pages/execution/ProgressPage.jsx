import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { budgetApi, progressApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

// Avance por Ítem: SOLO registra avance (cantidades ejecutadas + fotos) sobre los ítems que ya
// existen en el presupuesto. La carga/edición del presupuesto (import, IA, AIU, export) vive en
// la nueva pestaña "Presupuesto del Proyecto" (ver BudgetPage.jsx) — este componente ya no tiene
// ningún control para crear, editar cantidad ni eliminar un ítem de presupuesto.
export default function ProgressPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [budget, setBudget] = useState(null);
  const [items, setItems] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => budgetApi.get(projectId).then((data) => {
    setBudget(data.budget);
    setItems(data.items);
  });
  useEffect(() => { load(); }, [projectId]);

  return (
    <div>
      <Card title={t('execution.progress.itemsTitle')}>
        {!budget && (
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-3">
            {t('execution.progress.noBudget')}
          </p>
        )}
        <Table columns={[t('execution.budget.items.table.code'), t('execution.budget.items.table.description'), t('execution.budget.items.table.budgetedQty'), t('execution.budget.items.table.executed'), t('execution.budget.items.table.percent'), t('execution.budget.items.table.unitValue'), t('execution.budget.items.table.total'), t('execution.budget.items.table.executedValue'), '']}>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-gray-100">
              <td className="py-2 pr-3 text-gray-400 font-mono text-xs">{it.APU?.code || it.itemCode || '-'}</td>
              <td className="py-2 pr-3">
                <span>{it.description} <span className="text-gray-400">({it.unit})</span></span>
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
          {items.length === 0 && <tr><td colSpan={9} className="py-3 text-center text-gray-400">{t('execution.budget.items.empty')}</td></tr>}
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

  const [submit, submitting] = useSubmitGuard(async (e) => {
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
  });

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
          <Button type="submit" className="col-span-full" loading={submitting}>{t('execution.budget.progress.register')}</Button>
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
