import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cashBoxesApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const emptyForm = { name: '', initialBalance: '' };
const emptyMovement = { amount: '', date: '', concept: '' };

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
  const [cashBox, setCashBox] = useState(null);
  const [form, setForm] = useState(emptyMovement);
  const [error, setError] = useState('');

  const load = () => cashBoxesApi.get(cashBoxId).then(setCashBox);
  useEffect(() => { load(); }, [cashBoxId]);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await cashBoxesApi.addMovement(cashBoxId, form);
      setForm(emptyMovement);
      load();
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  if (!cashBox) return null;
  const canEdit = cashBox.status === 'activa';

  return (
    <Card title={t('cashBoxes.movementsTitle', { name: cashBox.name })}>
      {canEdit && (
        <Can module="cajas" action="edit">
          <form onSubmit={submit} className="flex flex-wrap gap-2 items-end mb-4 border-b pb-4">
            <Input label={t('cashBoxes.fields.amount')} type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <Input label={t('cashBoxes.fields.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Input label={t('cashBoxes.fields.concept')} value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} className="min-w-[220px]" required />
            <Button type="submit" loading={submitting}>{t('cashBoxes.registerIncome')}</Button>
          </form>
        </Can>
      )}
      <ErrorText>{error}</ErrorText>
      <Table columns={[t('cashBoxes.table.date'), t('cashBoxes.table.concept'), t('cashBoxes.table.amount')]}>
        {cashBox.movements?.map((m) => (
          <tr key={m.id} className="border-b border-gray-100">
            <td className="py-1 pr-3">{formatDate(m.date)}</td>
            <td className="py-1 pr-3">{m.concept}</td>
            <td className="py-1 pr-3">{money(m.amount)}</td>
          </tr>
        ))}
        {(!cashBox.movements || cashBox.movements.length === 0) && <tr><td colSpan={3} className="py-3 text-center text-gray-400">{t('cashBoxes.noMovements')}</td></tr>}
      </Table>
    </Card>
  );
}
