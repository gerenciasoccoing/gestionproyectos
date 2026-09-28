import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { employeeContractsApi, laborParamsApi, projectsApi } from '../../api';
import { buildEmployeeApi } from './employeeApiFactory';
import { Card, Button, Input, Select, SearchSelect, Table, Badge, ErrorText, extractError, money, formatDate } from '../../components/ui';
import Can from '../../components/Can';
import ProviderSelect from '../../components/ProviderSelect';
import ContractValueHelper from '../../components/ContractValueHelper';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const EMPTY_FORM = {
  name: '', position: '', entryDate: '', dedicationHours: '', salaryValue: '',
  documentType: '', documentNumber: '', address: '', city: '', phone: '', email: '', nationality: 'Colombiana',
  contractType: '', contractObject: '', contractEndDate: '',
  epsName: '', pensionFundName: '', arlName: '',
  subcontractorLegalName: '', subcontractorNit: '', subcontractorLegalRep: '',
  vinculacion: 'proyecto', projectId: '',
};
const EMPTY_FILTERS = { vinculacion: '', projectId: '', contractType: '' };

const NEEDS_END_DATE = new Set(['termino_fijo', 'aprendizaje', 'prestacion_servicios', 'subcontratista_natural', 'subcontratista_juridica']);
const IS_SUBCONTRATISTA_JURIDICA = (t) => t === 'subcontratista_juridica';
const IS_LABORAL = (t) => ['obra_labor', 'termino_fijo', 'termino_indefinido'].includes(t);

// Un solo componente para las DOS vistas de Personal: dentro de un proyecto (useOutletContext trae
// projectId, ver ProjectLayout.jsx) y la vista general del menú principal (sin ese contexto,
// projectId queda undefined) — mismo modelo/tabla y misma lógica en los dos casos, ver el
// comentario al inicio de employeeController.js en el backend. Solo cambia qué API se llama
// (buildEmployeeApi) y qué controles adicionales se muestran (vinculación/filtros son exclusivos
// del menú principal).
export default function PersonnelListPage() {
  const { t } = useTranslation();
  const outletCtx = useOutletContext();
  const projectId = outletCtx?.projectId;
  const isGeneral = !projectId;
  const api = buildEmployeeApi(projectId);

  const [employees, setEmployees] = useState([]);
  const [contractTypes, setContractTypes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, projectId: projectId || '' });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [laborParams, setLaborParams] = useState(null);

  const load = () => {
    const params = { status: showHistory ? 'retirado' : 'activo' };
    if (isGeneral) {
      if (filters.vinculacion) params.vinculacion = filters.vinculacion;
      if (filters.projectId) params.projectId = filters.projectId;
      if (filters.contractType) params.contractType = filters.contractType;
    }
    api.employees.list(params).then(setEmployees);
  };
  useEffect(() => { load(); }, [projectId, showHistory, filters]);
  useEffect(() => { employeeContractsApi.contractTypes().then(setContractTypes); }, []);
  useEffect(() => { laborParamsApi.current().then(setLaborParams).catch(() => {}); }, []);
  useEffect(() => { if (isGeneral) projectsApi.list().then(setProjects); }, [isGeneral]);

  const toggleForm = () => {
    setShowForm((s) => {
      const next = !s;
      if (next && laborParams && !form.salaryValue) {
        setForm((f) => ({ ...f, salaryValue: laborParams.smlv }));
      }
      return next;
    });
  };

  const [submit, submitting] = useSubmitGuard(async (e) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'vinculacion') return; // solo controla el formulario, no se envía
        if (k === 'projectId' && !isGeneral) return; // en modo proyecto el projectId lo fija la URL
        if (k === 'projectId' && isGeneral && form.vinculacion === 'administrativo') return; // administrativo: sin proyecto
        fd.append(k, v);
      });
      if (file) fd.append('file', file);
      await api.employees.create(fd);
      setForm({ ...EMPTY_FORM, projectId: projectId || '' });
      setFile(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  });

  const remove = async (emp) => {
    if (!window.confirm(t('personnel.detail.deleteConfirm', { name: emp.name }))) return;
    setError('');
    try {
      await api.employees.remove(emp.id);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  // previewContractValue no depende del proyecto (solo salario/fechas, ver
  // employeeController.js#previewContractValue) — api.employees ya apunta a la ruta correcta según
  // el modo (general o anidada en proyecto), sin necesidad de distinguir por vinculación acá.
  const previewFn = (data) => api.employees.previewContractValue(data);

  const detailPath = (id) => (isGeneral ? `/personnel/${id}` : `../personnel/${id}`);

  return (
    <Card title={showHistory ? t('personnel.list.titleHistory') : t('personnel.list.titleActive')} actions={
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setShowHistory((s) => !s)}>
          {showHistory ? t('personnel.list.viewActive') : t('personnel.list.viewHistory')}
        </Button>
        {!showHistory && (
          <Can module="personal" action="create">
            <Button onClick={toggleForm}>{showForm ? t('common.cancel') : t('personnel.list.add')}</Button>
          </Can>
        )}
      </div>
    }>
      {isGeneral && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 border-b pb-4">
          <Select label={t('personnel.list.filters.vinculacion')} value={filters.vinculacion} onChange={(e) => setFilters((f) => ({ ...f, vinculacion: e.target.value }))}>
            <option value="">{t('personnel.list.filters.all')}</option>
            <option value="administrativo">{t('personnel.list.vinculacion.administrativo')}</option>
            <option value="proyecto">{t('personnel.list.vinculacion.proyecto')}</option>
          </Select>
          <SearchSelect
            label={t('personnel.list.filters.project')}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={filters.projectId}
            onChange={(v) => setFilters((f) => ({ ...f, projectId: v, vinculacion: v ? 'proyecto' : f.vinculacion }))}
            placeholder={t('personnel.list.filters.allProjects')}
          />
          <Select label={t('personnel.contract.type')} value={filters.contractType} onChange={(e) => setFilters((f) => ({ ...f, contractType: e.target.value }))}>
            <option value="">{t('personnel.list.filters.all')}</option>
            {contractTypes.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </Select>
          {(filters.vinculacion || filters.projectId || filters.contractType) && (
            <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>{t('expenses.filters.clear')}</Button>
          )}
        </div>
      )}
      {!showForm && <ErrorText>{error}</ErrorText>}
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {isGeneral && (
            <>
              <Select label={t('personnel.list.filters.vinculacion')} value={form.vinculacion} onChange={(e) => setForm({ ...form, vinculacion: e.target.value, projectId: e.target.value === 'administrativo' ? '' : form.projectId })}>
                <option value="proyecto">{t('personnel.list.vinculacion.proyecto')}</option>
                <option value="administrativo">{t('personnel.list.vinculacion.administrativo')}</option>
              </Select>
              {form.vinculacion === 'proyecto' && (
                <SearchSelect
                  label={t('personnel.list.filters.project')}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  value={form.projectId}
                  onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
                  placeholder={t('common.selectPlaceholder')}
                />
              )}
            </>
          )}
          <Input label={t('personnel.list.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t('personnel.list.position')} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required />
          <Input label={t('personnel.list.entryDate')} type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required />
          <Input label={t('personnel.list.dedicationHours')} type="number" min="0" step="0.01" value={form.dedicationHours} onChange={(e) => setForm({ ...form, dedicationHours: e.target.value })} />
          <Input label={t('personnel.list.salaryBase')} type="number" min="0" step="0.01" value={form.salaryValue} onChange={(e) => setForm({ ...form, salaryValue: e.target.value })} required />
          <Input label={t('personnel.list.contractFile')} type="file" onChange={(e) => setFile(e.target.files[0])} />
          <ContractValueHelper
            laborParams={laborParams}
            previewFn={previewFn}
            salaryValue={form.salaryValue}
            entryDate={form.entryDate}
            contractEndDate={form.contractEndDate}
            showRange={NEEDS_END_DATE.has(form.contractType)}
          />

          <Select label={t('personnel.contract.type')} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })} className="lg:col-span-1">
            <option value="">{t('personnel.contract.selectType')}</option>
            {contractTypes.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </Select>
          <Select label={t('personnel.detail.documentType')} value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
            <option value="">-</option>
            <option value="CC">{t('personnel.detail.documentTypes.CC')}</option>
            <option value="CE">{t('personnel.detail.documentTypes.CE')}</option>
            <option value="PASAPORTE">{t('personnel.detail.documentTypes.PASAPORTE')}</option>
            <option value="PEP">{t('personnel.detail.documentTypes.PEP')}</option>
          </Select>
          <Input label={t('personnel.detail.documentNumber')} value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} />
          <Input label={t('personnel.detail.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label={t('personnel.detail.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label={t('personnel.detail.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t('personnel.detail.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('personnel.detail.emailPlaceholder')} />
          <Input label={t('personnel.detail.nationality')} value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
          <Input label={t('personnel.contract.object')} value={form.contractObject} onChange={(e) => setForm({ ...form, contractObject: e.target.value })} className="lg:col-span-2" />
          {NEEDS_END_DATE.has(form.contractType) && (
            <Input label={t('personnel.contract.endDate')} type="date" value={form.contractEndDate} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} />
          )}

          {IS_LABORAL(form.contractType) || form.contractType === 'aprendizaje' ? (
            <>
              <ProviderSelect type="eps" label={t('personnel.detail.eps')} value={form.epsName} onChange={(v) => setForm({ ...form, epsName: v })} />
              {form.contractType !== 'aprendizaje' && (
                <ProviderSelect type="pension" label={t('personnel.detail.pensionFund')} value={form.pensionFundName} onChange={(v) => setForm({ ...form, pensionFundName: v })} />
              )}
              <ProviderSelect type="arl" label={t('personnel.detail.arl')} value={form.arlName} onChange={(v) => setForm({ ...form, arlName: v })} />
            </>
          ) : null}
          {form.contractType === 'subcontratista_natural' && (
            <ProviderSelect type="arl" label={t('personnel.detail.arl')} value={form.arlName} onChange={(v) => setForm({ ...form, arlName: v })} />
          )}

          {IS_SUBCONTRATISTA_JURIDICA(form.contractType) && (
            <>
              <Input label={t('personnel.contract.subcontractorLegalName')} value={form.subcontractorLegalName} onChange={(e) => setForm({ ...form, subcontractorLegalName: e.target.value })} />
              <Input label={t('personnel.contract.subcontractorNit')} value={form.subcontractorNit} onChange={(e) => setForm({ ...form, subcontractorNit: e.target.value })} />
              <Input label={t('personnel.contract.subcontractorLegalRep')} value={form.subcontractorLegalRep} onChange={(e) => setForm({ ...form, subcontractorLegalRep: e.target.value })} />
            </>
          )}

          <Button type="submit" className="col-span-full" loading={submitting}>{t('common.save')}</Button>
          <div className="col-span-full"><ErrorText>{error}</ErrorText></div>
        </form>
      )}
      <Table columns={[
        t('personnel.list.table.name'), t('personnel.list.table.position'),
        ...(isGeneral ? [t('personnel.list.filters.vinculacion')] : []),
        t('personnel.list.table.entry'), t('personnel.list.table.exit'), t('personnel.list.table.salary'), t('personnel.list.table.status'), t('personnel.contract.table.signature'), '',
      ]}>
        {employees.map((emp) => {
          // El "vigente" para efectos de firma es el más reciente por sequenceNumber (mismo
          // criterio que ya usa la ficha del trabajador para el otrosí) — no todos los documentos
          // del historial, solo el que importa mostrar de un vistazo en la lista.
          const latestDoc = (emp.contractDocuments || []).length
            ? [...emp.contractDocuments].sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0]
            : null;
          return (
          <tr key={emp.id} className="border-b border-gray-100">
            <td className="py-2 pr-3">{emp.name}</td>
            <td className="py-2 pr-3">{emp.position}</td>
            {isGeneral && (
              <td className="py-2 pr-3">
                {emp.projectId
                  ? <span>{t('personnel.list.vinculacion.proyecto')}{emp.Project ? ` — ${emp.Project.name}` : ''}</span>
                  : <Badge color="blue">{t('personnel.list.vinculacion.administrativo')}</Badge>}
              </td>
            )}
            <td className="py-2 pr-3">{formatDate(emp.entryDate)}</td>
            <td className="py-2 pr-3">{formatDate(emp.exitDate) || '-'}</td>
            <td className="py-2 pr-3">{money(emp.salaryValue)}</td>
            <td className="py-2 pr-3"><Badge color={emp.status === 'activo' ? 'green' : 'gray'}>{t(`personnel.list.status.${emp.status}`, emp.status)}</Badge></td>
            <td className="py-2 pr-3">
              {latestDoc ? (
                <Badge color={latestDoc.signatureStatus === 'firmado' ? 'green' : latestDoc.signatureStatus === 'pendiente' ? 'yellow' : 'gray'}>
                  {t(`personnel.contract.signatureStatus.${latestDoc.signatureStatus}`)}
                </Badge>
              ) : <span className="text-gray-400 text-xs">-</span>}
            </td>
            <td className="py-2 pr-3 text-right whitespace-nowrap">
              <Link to={detailPath(emp.id)} className="text-blue-600 hover:underline text-sm">{t('personnel.list.viewDetail')}</Link>
              <Can module="personal" action="delete">
                <button type="button" className="text-red-600 hover:underline text-sm ml-3" onClick={() => remove(emp)}>{t('personnel.detail.delete')}</button>
              </Can>
            </td>
          </tr>
          );
        })}
        {employees.length === 0 && <tr><td colSpan={isGeneral ? 9 : 8} className="py-3 text-center text-gray-400">{t('personnel.list.empty')}</td></tr>}
      </Table>
    </Card>
  );
}
