import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { executionApi } from '../../api';
import { Card, money } from '../../components/ui';

export default function ExecutionDashboardPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [data, setData] = useState(null);
  const intervalRef = useRef(null);

  const load = () => executionApi.dashboard(projectId).then(setData);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 8000); // refresco casi en tiempo real
    return () => clearInterval(intervalRef.current);
  }, [projectId]);

  if (!data) return <div className="text-gray-500">{t('execution.dashboard.loading')}</div>;

  const executedVsBudget = [
    { name: t('common.total'), budgeted: data.budgetedValue, executed: data.executedValue },
  ];
  const expensesData = data.expensesByCategory.map((e) => ({
    name: t(`execution.dashboard.categories.${e.category}`, e.category),
    expense: e.amount,
  }));

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <Card title={t('execution.dashboard.physicalProgress')}>
          <div className="flex flex-col items-center py-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={data.physicalProgressPercent >= 100 ? '#16a34a' : '#2563eb'}
                  strokeWidth="3"
                  strokeDasharray={`${Math.min(data.physicalProgressPercent, 100)}, 100`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-800">
                {data.physicalProgressPercent}%
              </div>
            </div>
          </div>
        </Card>
        <Card title={t('execution.dashboard.executedVsBudget')}>
          <p className="text-2xl font-bold text-gray-800">{money(data.executedValue)}</p>
          <p className="text-sm text-gray-500">{t('execution.dashboard.ofBudgeted', { amount: money(data.budgetedValue) })}</p>
        </Card>
        <Card title={t('execution.dashboard.accumulatedExpenses')}>
          <p className="text-2xl font-bold text-gray-800">{money(data.expensesValue)}</p>
          <p className="text-sm text-gray-500">{t('execution.dashboard.autoRefresh')}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title={t('execution.dashboard.comparisonChart')}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={executedVsBudget}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => money(v)} width={90} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar dataKey="budgeted" name={t('execution.dashboard.budgeted')} fill="#93c5fd" />
              <Bar dataKey="executed" name={t('execution.dashboard.executed')} fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t('execution.dashboard.expenseByCategory')}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={expensesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => money(v)} width={90} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="expense" name={t('execution.dashboard.expense')} fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title={t('execution.dashboard.itemDetail')} className="mt-4">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-3 font-medium">{t('execution.dashboard.table.item')}</th>
              <th className="py-2 pr-3 font-medium">{t('execution.dashboard.table.percent')}</th>
              <th className="py-2 pr-3 font-medium">{t('execution.dashboard.table.executedValue')}</th>
              <th className="py-2 pr-3 font-medium">{t('execution.dashboard.table.budgetedValue')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.id} className="border-b border-gray-100">
                <td className="py-2 pr-3">{i.description}</td>
                <td className="py-2 pr-3">{i.percent}%</td>
                <td className="py-2 pr-3">{money(i.executedValue)}</td>
                <td className="py-2 pr-3">{money(i.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
