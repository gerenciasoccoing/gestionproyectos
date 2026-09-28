import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  adminExpenseReportApi, adminExpenseCategoriesApi, thirdPartiesApi, cashBoxesApi, generalEmployeesApi,
} from '../../api';
import { Card, Button, Input, Select, SearchSelect, Table, ErrorText, extractError, money } from '../../components/ui';

const EMPTY_FILTERS = { from: '', to: '', adminCategoryId: '', supplierId: '', cashBoxId: '', employeeId: '' };

function monthRange(base = new Date()) {
  const y = base.getFullYear();
  const m = base.getMonth();
  const from = new Date(y, m, 1).toISOString().slice(0, 10);
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}
function quarterRange(base = new Date()) {
  const y = base.getFullYear();
  const q = Math.floor(base.getMonth() / 3);
  const from = new Date(y, q * 3, 1).toISOString().slice(0, 10);
  const to = new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10);
  return { from, to };
}
function yearRange(base = new Date()) {
  const y = base.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}
// Mismo rango de un año atrás, para "comparar con el periodo anterior" (ej. este año vs el
// anterior) — el backend no sabe nada de "periodos", el frontend solo llama el mismo endpoint dos
// veces con from/to distintos (ver adminExpenseReportService.js).
function shiftYear(dateStr, delta) {
  if (!dateStr) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y + delta}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Reporte de Gastos Administrativos Generales (Gastos > Reporte de gastos administrativos, gated
// por el permiso 'gastos_admin:view', ver App.jsx). Solo trae expenseType='administrativo' — nunca
// se mezcla con gastos de proyecto (ver adminExpenseReportService.js).
export default function AdminExpenseReportPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [comparePrevious, setComparePrevious] = useState(false);
  const [previousReport, setPreviousReport] = useState(null);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    adminExpenseCategoriesApi.list().then(setCategories);
    thirdPartiesApi.list({ type: 'proveedor' }).then(setSuppliers);
    cashBoxesApi.list().then(setCashBoxes);
    generalEmployeesApi.list({ vinculacion: 'administrativo' }).then(setEmployees);
  }, []);

  const load = () => {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    adminExpenseReportApi.get(params).then(setReport).catch((err) => setError(extractError(err)));
    if (comparePrevious && (filters.from || filters.to)) {
      const prevParams = { ...params, from: shiftYear(filters.from, -1), to: shiftYear(filters.to, -1) };
      adminExpenseReportApi.get(prevParams).then(setPreviousReport).catch(() => setPreviousReport(null));
    } else {
      setPreviousReport(null);
    }
  };
  useEffect(() => { load(); }, [filters, comparePrevious]);

  const applyQuickRange = (fn) => setFilters((f) => ({ ...f, ...fn() }));

  const chartData = useMemo(() => (report?.monthlyTotals || []).map((m) => ({ name: m.month, total: m.total })), [report]);

  const exportFile = async (kind) => {
    setExporting(kind);
    setError('');
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      if (kind === 'pdf') await adminExpenseReportApi.exportPdf(params);
      else await adminExpenseReportApi.exportExcel(params);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setExporting('');
    }
  };

  return (
    <div>
      <Card title={t('expenses.adminReport.title')}>
        <p className="text-sm text-gray-500 mb-3">{t('expenses.adminReport.help')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
          <Input label={t('expenses.filters.from')} type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          <Input label={t('expenses.filters.to')} type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          <Select label={t('expenses.category')} value={filters.adminCategoryId} onChange={(e) => setFilters((f) => ({ ...f, adminCategoryId: e.target.value }))}>
            <option value="">{t('expenses.filters.allTypes')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <SearchSelect
            label={t('expenses.filters.supplier')}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={filters.supplierId}
            onChange={(v) => setFilters((f) => ({ ...f, supplierId: v }))}
            placeholder={t('expenses.filters.allSuppliers')}
          />
          <Select label={t('expenses.filters.cashBox')} value={filters.cashBoxId} onChange={(e) => setFilters((f) => ({ ...f, cashBoxId: e.target.value }))}>
            <option value="">{t('expenses.filters.allCashBoxes')}</option>
            {cashBoxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name}</option>)}
          </Select>
          <SearchSelect
            label={t('expenses.adminReport.employee')}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            value={filters.employeeId}
            onChange={(v) => setFilters((f) => ({ ...f, employeeId: v }))}
            placeholder={t('expenses.filters.allTypes')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button variant="secondary" onClick={() => applyQuickRange(() => monthRange())}>{t('expenses.adminReport.thisMonth')}</Button>
          <Button variant="secondary" onClick={() => applyQuickRange(() => quarterRange())}>{t('expenses.adminReport.thisQuarter')}</Button>
          <Button variant="secondary" onClick={() => applyQuickRange(() => yearRange())}>{t('expenses.adminReport.thisYear')}</Button>
          {(filters.from || filters.to || filters.adminCategoryId || filters.supplierId || filters.cashBoxId || filters.employeeId) && (
            <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>{t('expenses.filters.clear')}</Button>
          )}
          <label className="flex items-center gap-2 text-sm ml-auto">
            <input type="checkbox" checked={comparePrevious} onChange={(e) => setComparePrevious(e.target.checked)} />
            {t('expenses.adminReport.comparePrevious')}
          </label>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => exportFile('pdf')} loading={exporting === 'pdf'}>{t('expenses.adminReport.exportPdf')}</Button>
          <Button variant="secondary" onClick={() => exportFile('excel')} loading={exporting === 'excel'}>{t('expenses.adminReport.exportExcel')}</Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </Card>

      {report && (
        <>
          <div className={`grid grid-cols-1 ${previousReport ? 'sm:grid-cols-2' : ''} gap-4 mt-4`}>
            <Card title={t('expenses.adminReport.totalsByCategory')}>
              <Table columns={[t('expenses.category'), t('expenses.list.value')]}>
                {report.totalsByCategory.map((c) => (
                  <tr key={c.categoryId || 'none'} className="border-b border-gray-100">
                    <td className="py-1 pr-3">{c.categoryName}</td>
                    <td className="py-1 pr-3">{money(c.total)}</td>
                  </tr>
                ))}
                {report.totalsByCategory.length === 0 && <tr><td colSpan={2} className="py-2 text-center text-gray-400">{t('expenses.empty')}</td></tr>}
              </Table>
              <p className="text-right font-bold mt-2">{t('common.total')}: {money(report.totalGeneral)}</p>
            </Card>
            {previousReport && (
              <Card title={t('expenses.adminReport.previousPeriod')}>
                <Table columns={[t('expenses.category'), t('expenses.list.value')]}>
                  {previousReport.totalsByCategory.map((c) => (
                    <tr key={c.categoryId || 'none'} className="border-b border-gray-100">
                      <td className="py-1 pr-3">{c.categoryName}</td>
                      <td className="py-1 pr-3">{money(c.total)}</td>
                    </tr>
                  ))}
                  {previousReport.totalsByCategory.length === 0 && <tr><td colSpan={2} className="py-2 text-center text-gray-400">{t('expenses.empty')}</td></tr>}
                </Table>
                <p className="text-right font-bold mt-2">{t('common.total')}: {money(previousReport.totalGeneral)}</p>
                <p className="text-right text-sm text-gray-500 mt-1">
                  {t('expenses.adminReport.variation')}: {money(report.totalGeneral - previousReport.totalGeneral)}
                </p>
              </Card>
            )}
          </div>

          <Card title={t('expenses.adminReport.monthlyChart')} className="mt-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => money(v)} width={90} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="total" name={t('expenses.adminReport.monthlyTotal')} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={t('expenses.adminReport.detailTitle')} className="mt-4">
            <Table columns={[t('expenses.list.date'), t('expenses.category'), t('expenses.vendor'), t('expenses.cashBox'), t('expenses.adminReport.employee'), t('expenses.list.value')]}>
              {report.rows.map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="py-1 pr-3">{e.date}</td>
                  <td className="py-1 pr-3">{e.adminCategory?.name || '-'}</td>
                  <td className="py-1 pr-3">{e.supplierParty?.name || e.vendorName || '-'}</td>
                  <td className="py-1 pr-3">{e.CashBox?.name || '-'}</td>
                  <td className="py-1 pr-3">{e.Employee?.name || '-'}</td>
                  <td className="py-1 pr-3">{money(e.amount)}</td>
                </tr>
              ))}
              {report.rows.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('expenses.empty')}</td></tr>}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
