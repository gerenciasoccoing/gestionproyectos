import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marketStudiesApi, projectsApi, budgetApi } from '../../api';
import {
  Card, Button, Input, SearchSelect, Table, Badge, ErrorText, extractError, formatDate,
} from '../../components/ui';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

// Un solo componente para las dos vistas (mismo patrón que ExpensesPage.jsx): dentro de un
// proyecto (useOutletContext trae projectId, ver ProjectLayout.jsx) y la vista general del menú
// principal (sin ese contexto). Mismo backend en ambos casos.
export default function MarketStudiesPage() {
  const { t } = useTranslation();
  const outletCtx = useOutletContext();
  const projectId = outletCtx?.projectId;
  const isGeneral = !projectId;

  const [studies, setStudies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', projectId: '', budgetItemId: '' });
  const [error, setError] = useState('');

  const load = () => marketStudiesApi.list(projectId).then(setStudies);
  useEffect(() => { load(); }, [projectId]);
  useEffect(() => { if (isGeneral) projectsApi.list().then(setProjects); }, [isGeneral]);
  useEffect(() => {
    const pid = isGeneral ? form.projectId : projectId;
    if (pid) budgetApi.get(pid).then((d) => setBudgetItems(d.items)).catch(() => setBudgetItems([]));
    else setBudgetItems([]);
  }, [isGeneral, form.projectId, projectId]);

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      await marketStudiesApi.create(projectId, {
        title: form.title,
        projectId: isGeneral ? (form.projectId || undefined) : undefined,
        budgetItemId: form.budgetItemId || undefined,
      });
      setForm({ title: '', projectId: '', budgetItemId: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <Card
      title={t('marketStudy.title')}
      actions={
        <Can module="estudio_mercado" action="create">
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('marketStudy.new')}</Button>
        </Can>
      }
    >
      <p className="text-sm text-gray-500 mb-3">{t('marketStudy.subtitle')}</p>

      {showForm && (
        <form onSubmit={submit} className="mb-4 border rounded p-3 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Input label={t('marketStudy.studyTitle')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="sm:col-span-2" />
            {isGeneral && (
              <SearchSelect
                label={t('marketStudy.project')}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                value={form.projectId}
                onChange={(v) => setForm((f) => ({ ...f, projectId: v, budgetItemId: '' }))}
                placeholder={t('marketStudy.noProjectPlaceholder')}
              />
            )}
            <SearchSelect
              label={t('marketStudy.budgetItem')}
              options={budgetItems.map((bi) => ({ value: bi.id, label: bi.description }))}
              value={form.budgetItemId}
              onChange={(v) => setForm((f) => ({ ...f, budgetItemId: v }))}
              placeholder={t('execution.purchaseOrders.nonePlaceholder')}
              disabled={isGeneral && !form.projectId}
            />
          </div>
          <Button type="submit" loading={submitting}>{t('common.save')}</Button>
          <ErrorText>{error}</ErrorText>
        </form>
      )}

      <Table columns={[t('marketStudy.table.title'), ...(isGeneral ? [t('marketStudy.table.project')] : []), t('marketStudy.table.suppliers'), t('marketStudy.table.status'), t('marketStudy.table.created'), '']}>
        {studies.map((s) => (
          <tr key={s.id} className="border-b border-gray-100">
            <td className="py-2 pr-3 font-medium text-gray-900">{s.title}</td>
            {isGeneral && <td className="py-2 pr-3">{s.Project?.name || <span className="text-gray-400">-</span>}</td>}
            <td className="py-2 pr-3">{s.quotationCount ?? '-'}</td>
            <td className="py-2 pr-3">
              <Badge color={s.status === 'decidida' ? 'green' : 'yellow'}>{t(`marketStudy.status.${s.status}`, s.status)}</Badge>
            </td>
            <td className="py-2 pr-3">{formatDate(s.createdAt)}</td>
            <td className="py-2 pr-3 text-right">
              <Link to={`${s.id}`} className="text-blue-600 hover:underline text-sm">{t('marketStudy.viewDetail')}</Link>
            </td>
          </tr>
        ))}
        {studies.length === 0 && <tr><td colSpan={isGeneral ? 6 : 5} className="py-3 text-center text-gray-400">{t('marketStudy.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
