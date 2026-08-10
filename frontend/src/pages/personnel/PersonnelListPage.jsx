import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { employeesApi } from '../../api';
import { Card, Button, Input, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import Can from '../../components/Can';

export default function PersonnelListPage() {
  const { t } = useTranslation();
  const { projectId } = useOutletContext();
  const [employees, setEmployees] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', position: '', entryDate: '', dedicationHours: '', salaryValue: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const load = () => employeesApi.list(projectId, showHistory ? 'retirado' : 'activo').then(setEmployees);
  useEffect(() => { load(); }, [projectId, showHistory]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      await employeesApi.create(projectId, fd);
      setForm({ name: '', position: '', entryDate: '', dedicationHours: '', salaryValue: '' });
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <Card title={showHistory ? t('personnel.list.titleHistory') : t('personnel.list.titleActive')} actions={
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setShowHistory((s) => !s)}>
          {showHistory ? t('personnel.list.viewActive') : t('personnel.list.viewHistory')}
        </Button>
        {!showHistory && (
          <Can module="personal" action="create">
            <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('personnel.list.add')}</Button>
          </Can>
        )}
      </div>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Input label={t('personnel.list.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('personnel.list.position')} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required />
          <Input label={t('personnel.list.entryDate')} type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required />
          <Input label={t('personnel.list.dedicationHours')} type="number" min="0" step="0.01" value={form.dedicationHours} onChange={(e) => setForm({ ...form, dedicationHours: e.target.value })} />
          <Input label={t('personnel.list.salary')} type="number" min="0" step="0.01" value={form.salaryValue} onChange={(e) => setForm({ ...form, salaryValue: e.target.value })} required />
          <Input label={t('personnel.list.contractFile')} type="file" onChange={(e) => setFile(e.target.files[0])} />
          <Button type="submit" className="col-span-full">{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('personnel.list.table.name'), t('personnel.list.table.position'), t('personnel.list.table.entry'), t('personnel.list.table.exit'), t('personnel.list.table.salary'), t('personnel.list.table.status'), '']}>
        {employees.map((emp) => (
          <tr key={emp.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{emp.name}</td>
            <td className="py-2 pr-3">{emp.position}</td>
            <td className="py-2 pr-3">{formatDate(emp.entryDate)}</td>
            <td className="py-2 pr-3">{formatDate(emp.exitDate) || '-'}</td>
            <td className="py-2 pr-3">{money(emp.salaryValue)}</td>
            <td className="py-2 pr-3"><Badge color={emp.status === 'activo' ? 'green' : 'gray'}>{t(`personnel.list.status.${emp.status}`, emp.status)}</Badge></td>
            <td className="py-2 pr-3 text-right">
              <Link to={`../personnel/${emp.id}`} className="text-blue-600 hover:underline text-sm">{t('personnel.list.viewDetail')}</Link>
            </td>
          </tr>
        ))}
        {employees.length === 0 && <tr><td colSpan={7} className="py-3 text-center text-gray-400">{t('personnel.list.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
