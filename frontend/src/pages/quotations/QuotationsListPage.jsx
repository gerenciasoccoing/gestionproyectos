import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { quotationsApi, thirdPartiesApi } from '../../api';
import { Card, Button, Input, SearchSelect, TextArea, Table, Badge, ErrorText, extractError, formatDate } from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

export default function QuotationsListPage() {
  const { t } = useTranslation();
  const [quotations, setQuotations] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const emptyForm = { clientName: '', clientId: '', projectNameProposed: '', date: '', validityDays: 30, paymentTerms: '', adminPercent: '0', imprevistosPercent: '0', utilidadPercent: '0' };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => quotationsApi.list().then(setQuotations);
  useEffect(() => {
    load();
    thirdPartiesApi.list({ type: 'cliente' }).then(setClients);
  }, []);

  const pickClient = (clientId) => {
    const c = clients.find((x) => x.id === clientId);
    setForm((f) => ({ ...f, clientId, clientName: c ? c.name : f.clientName }));
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await quotationsApi.create({ ...form, clientId: form.clientId || undefined });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const statusColor = { borrador: 'gray', enviada: 'yellow', convertida: 'green' };

  return (
    <Card title={t('quotations.list.title')} actions={
      <Can module="cotizaciones" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('quotations.list.new')}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <SearchSelect
            label={t('quotations.list.registeredClient')}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            value={form.clientId}
            onChange={pickClient}
            placeholder={t('quotations.list.clientPlaceholder')}
          />
          <Input label={t('quotations.list.client')} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value, clientId: '' })} required />
          <Input label={t('quotations.list.proposedProject')} value={form.projectNameProposed} onChange={(e) => setForm({ ...form, projectNameProposed: e.target.value })} required />
          <Input label={t('quotations.list.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <Input label={t('quotations.list.validity')} type="number" min="1" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} />
          <TextArea label={t('quotations.list.paymentTerms')} value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className="col-span-full" />
          <p className="col-span-full text-sm font-medium text-gray-600 -mb-1">{t('quotations.list.aiuTitle')}</p>
          <Input label={t('quotations.list.admin')} type="number" min="0" step="0.01" value={form.adminPercent} onChange={(e) => setForm({ ...form, adminPercent: e.target.value })} />
          <Input label={t('quotations.list.unforeseen')} type="number" min="0" step="0.01" value={form.imprevistosPercent} onChange={(e) => setForm({ ...form, imprevistosPercent: e.target.value })} />
          <Input label={t('quotations.list.profit')} type="number" min="0" step="0.01" value={form.utilidadPercent} onChange={(e) => setForm({ ...form, utilidadPercent: e.target.value })} />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('quotations.list.create')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('quotations.list.table.client'), t('quotations.list.table.project'), t('quotations.list.table.date'), t('quotations.list.table.status'), '']}>
        {quotations.map((q) => (
          <tr key={q.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{q.clientName}</td>
            <td className="py-2 pr-3">{q.projectNameProposed}</td>
            <td className="py-2 pr-3">{formatDate(q.date)}</td>
            <td className="py-2 pr-3"><Badge color={statusColor[q.status]}>{t(`enums.quotationStatus.${q.status}`, q.status)}</Badge></td>
            <td className="py-2 pr-3 text-right">
              <Link to={`/quotations/${q.id}`} className="text-blue-600 hover:underline text-sm">{t('quotations.list.viewDetail')}</Link>
            </td>
          </tr>
        ))}
        {quotations.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-400">{t('quotations.list.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
