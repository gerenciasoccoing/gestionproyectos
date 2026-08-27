import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { contractsApi, policiesApi } from '../../api';
import { Card, Button, Input, Table, ErrorText, extractError, money, formatDate } from '../../components/ui';
import { fileUrl } from '../../api/client';
import Can from '../../components/Can';
import useSubmitGuard from '../../hooks/useSubmitGuard';

export default function ContractualPage() {
  const { projectId } = useOutletContext();
  const [contracts, setContracts] = useState([]);
  const [policies, setPolicies] = useState([]);

  const load = () => {
    contractsApi.list(projectId).then(setContracts);
    policiesApi.list(projectId).then(setPolicies);
  };
  useEffect(() => { load(); }, [projectId]);

  return (
    <div>
      <ContractsSection projectId={projectId} contracts={contracts} onChange={load} />
      <PoliciesSection projectId={projectId} policies={policies} onChange={load} />
    </div>
  );
}

function ContractsSection({ projectId, contracts, onChange }) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ object: '', value: '', signedDate: '', endDate: '' });
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [error, setError] = useState('');

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      await contractsApi.create(projectId, fd);
      setForm({ object: '', value: '', signedDate: '', endDate: '' });
      setFile(null);
      setScanNotice('');
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const scanFile = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    setScanNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await contractsApi.scan(projectId, fd);
      setForm((f) => ({
        object: result.object || f.object,
        value: result.value ?? f.value,
        signedDate: result.signedDate || f.signedDate,
        endDate: result.endDate || f.endDate,
      }));
      setScanNotice(t('contractual.scanDone'));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t('contractual.contract.confirmDelete'))) return;
    await contractsApi.remove(projectId, id);
    onChange();
  };

  return (
    <Card title={t('contractual.contract.title')} actions={
      <Can module="contractual" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('contractual.contract.add')}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Input label={t('contractual.contract.file')} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { setFile(e.target.files[0]); setScanNotice(''); }} />
            <Button type="button" variant="secondary" disabled={!file || scanning} onClick={scanFile}>
              {scanning ? t('contractual.reading') : t('contractual.readAuto')}
            </Button>
          </div>
          {scanNotice && <p className="text-sm text-green-700 col-span-full">{scanNotice}</p>}
          <p className="text-xs text-gray-400 col-span-full">{t('contractual.scanNote')}</p>
          <Input label={t('contractual.contract.object')} value={form.object} onChange={(e) => setForm({ ...form, object: e.target.value })} required className="col-span-full" />
          <Input label={t('contractual.contract.value')} type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          <Input label={t('contractual.contract.signedDate')} type="date" value={form.signedDate} onChange={(e) => setForm({ ...form, signedDate: e.target.value })} required />
          <Input label={t('contractual.contract.endDate')} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('contractual.contract.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('contractual.contract.table.object'), t('contractual.contract.table.value'), t('contractual.contract.table.signed'), t('contractual.contract.table.end'), t('contractual.contract.table.file'), '']}>
        {contracts.map((c) => (
          <tr key={c.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{c.object}</td>
            <td className="py-2 pr-3">{money(c.value)}</td>
            <td className="py-2 pr-3">{formatDate(c.signedDate)}</td>
            <td className="py-2 pr-3">{formatDate(c.endDate)}</td>
            <td className="py-2 pr-3">{c.filePath ? <a className="text-blue-600 hover:underline" href={fileUrl(c.filePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
            <td className="py-2 pr-3 text-right">
              <Can module="contractual" action="delete"><Button variant="danger" onClick={() => remove(c.id)}>{t('common.delete')}</Button></Can>
            </td>
          </tr>
        ))}
        {contracts.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('contractual.contract.empty')}</td></tr>}
      </Table>
    </Card>
  );
}

function PoliciesSection({ projectId, policies, onChange }) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: '', value: '', coverageStart: '', coverageEnd: '' });
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const [error, setError] = useState('');

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      await policiesApi.create(projectId, fd);
      setForm({ type: '', value: '', coverageStart: '', coverageEnd: '' });
      setFile(null);
      setScanNotice('');
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const scanFile = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    setScanNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await policiesApi.scan(projectId, fd);
      setForm((f) => ({
        type: result.type || f.type,
        value: result.value ?? f.value,
        coverageStart: result.coverageStart || f.coverageStart,
        coverageEnd: result.coverageEnd || f.coverageEnd,
      }));
      setScanNotice(t('contractual.scanDone'));
    } catch (err) {
      setError(extractError(err));
    } finally {
      setScanning(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t('contractual.policies.confirmDelete'))) return;
    await policiesApi.remove(projectId, id);
    onChange();
  };

  return (
    <Card title={t('contractual.policies.title')} actions={
      <Can module="contractual" action="create">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? t('common.cancel') : t('contractual.policies.add')}</Button>
      </Can>
    }>
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Input label={t('contractual.policies.file')} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { setFile(e.target.files[0]); setScanNotice(''); }} />
            <Button type="button" variant="secondary" disabled={!file || scanning} onClick={scanFile}>
              {scanning ? t('contractual.reading') : t('contractual.readAuto')}
            </Button>
          </div>
          {scanNotice && <p className="text-sm text-green-700 col-span-full">{scanNotice}</p>}
          <p className="text-xs text-gray-400 col-span-full">{t('contractual.scanNote')}</p>
          <Input label={t('contractual.policies.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required />
          <Input label={t('contractual.policies.value')} type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          <Input label={t('contractual.policies.coverageStart')} type="date" value={form.coverageStart} onChange={(e) => setForm({ ...form, coverageStart: e.target.value })} required />
          <Input label={t('contractual.policies.coverageEnd')} type="date" value={form.coverageEnd} onChange={(e) => setForm({ ...form, coverageEnd: e.target.value })} required />
          <Button type="submit" className="col-span-full" loading={submitting}>{t('contractual.policies.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[t('contractual.policies.table.type'), t('contractual.policies.table.value'), t('contractual.policies.table.start'), t('contractual.policies.table.end'), t('contractual.policies.table.file'), '']}>
        {policies.map((p) => (
          <tr key={p.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{p.type}</td>
            <td className="py-2 pr-3">{money(p.value)}</td>
            <td className="py-2 pr-3">{formatDate(p.coverageStart)}</td>
            <td className="py-2 pr-3">{formatDate(p.coverageEnd)}</td>
            <td className="py-2 pr-3">{p.filePath ? <a className="text-blue-600 hover:underline" href={fileUrl(p.filePath)} target="_blank" rel="noreferrer">{t('common.view')}</a> : '-'}</td>
            <td className="py-2 pr-3 text-right">
              <Can module="contractual" action="delete"><Button variant="danger" onClick={() => remove(p.id)}>{t('common.delete')}</Button></Can>
            </td>
          </tr>
        ))}
        {policies.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-400">{t('contractual.policies.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
