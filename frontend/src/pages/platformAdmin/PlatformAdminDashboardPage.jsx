import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformAdminApi } from '../../api';
import { Card, Table, Badge, Button, Input, ErrorText, extractError, formatDate, formatDateTime } from '../../components/ui';
import Logo from '../../components/Logo';

const emptyForm = {
  companyName: '', nit: '', address: '', phone: '', contactEmail: '',
  adminName: '', adminEmail: '', adminPassword: '',
};

// Panel de super-admin: lista de empresas (tenants), activar/desactivar acceso, alta de empresas
// nuevas y edición del plan (esqueleto de planes/límites — ver Company.js: planTier es una
// etiqueta libre, maxUsers/maxActiveProjects son topes blandos, vacío = sin límite). No usa
// ProtectedRoute (esa es para usuarios de empresa) — la sesión de operador se valida contra el
// backend en cada carga; si no hay token o expiró, platformAdminClient redirige solo.
export default function PlatformAdminDashboardPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planForm, setPlanForm] = useState({ planTier: '', maxUsers: '', maxActiveProjects: '' });
  const [planError, setPlanError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  const [impersonating, setImpersonating] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [supportLog, setSupportLog] = useState(null);

  const load = () => {
    platformAdminApi.listCompanies().then(setCompanies).catch((err) => setError(extractError(err)));
  };

  useEffect(() => {
    if (!localStorage.getItem('platformAdminToken')) {
      navigate('/platform-admin/login');
      return;
    }
    load();
  }, []);

  const toggleActive = async (company) => {
    try {
      await platformAdminApi.setCompanyStatus(company.id, !company.active);
      load();
    } catch (err) {
      setError(extractError(err));
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submitCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await platformAdminApi.createCompany(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const startEditPlan = (company) => {
    setEditingPlanId(company.id);
    setPlanError('');
    setPlanForm({
      planTier: company.planTier || '',
      maxUsers: company.maxUsers ?? '',
      maxActiveProjects: company.maxActiveProjects ?? '',
    });
  };

  const setPlanField = (field) => (e) => setPlanForm((f) => ({ ...f, [field]: e.target.value }));

  const submitPlan = async (companyId) => {
    setSavingPlan(true);
    setPlanError('');
    try {
      await platformAdminApi.updateCompanyPlan(companyId, {
        planTier: planForm.planTier,
        maxUsers: planForm.maxUsers === '' ? null : Number(planForm.maxUsers),
        maxActiveProjects: planForm.maxActiveProjects === '' ? null : Number(planForm.maxActiveProjects),
      });
      setEditingPlanId(null);
      load();
    } catch (err) {
      setPlanError(extractError(err));
    } finally {
      setSavingPlan(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('platformAdminToken');
    navigate('/platform-admin/login');
  };

  // Acceso de soporte: pide un motivo (queda en el registro de auditoría junto con quién/cuándo/
  // a qué empresa), pide el token de sesión de usuario resultante y navega a la app normal como
  // ese usuario. No hay "modo soporte" visual en el resto de la app — es una sesión de usuario
  // común, con vida corta (30 min) por seguridad. Volver al panel de operador es simplemente
  // cerrar sesión ahí y volver a entrar en /platform-admin/login.
  const enterAsSupport = async (company) => {
    const reason = window.prompt(`¿Motivo del acceso de soporte a "${company.companyName}"? (queda registrado)`);
    if (reason === null) return;
    setImpersonating(company.id);
    setError('');
    try {
      const { token } = await platformAdminApi.impersonateCompany(company.id, reason);
      localStorage.setItem('token', token);
      window.location.href = '/';
    } catch (err) {
      setError(extractError(err));
      setImpersonating(null);
    }
  };

  const toggleLog = () => {
    if (!showLog && !supportLog) {
      platformAdminApi.listSupportAccessLog().then(setSupportLog).catch((err) => setError(extractError(err)));
    }
    setShowLog((v) => !v);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <h1 className="text-lg font-semibold text-gray-900">Panel de operador — Empresas</h1>
          </div>
          <Button type="button" variant="secondary" onClick={logout}>Salir</Button>
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <Card
          title="Empresas registradas"
          actions={<Button type="button" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancelar' : '+ Nueva empresa'}</Button>}
        >
          {showForm && (
            <form onSubmit={submitCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 pb-6 border-b border-gray-100">
              <Input label="Nombre de la empresa" value={form.companyName} onChange={set('companyName')} required />
              <Input label="NIT" value={form.nit} onChange={set('nit')} />
              <Input label="Dirección" value={form.address} onChange={set('address')} />
              <Input label="Teléfono" value={form.phone} onChange={set('phone')} />
              <Input label="Correo de contacto" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
              <div />
              <Input label="Nombre del administrador" value={form.adminName} onChange={set('adminName')} required />
              <Input label="Correo del administrador" type="email" value={form.adminEmail} onChange={set('adminEmail')} required />
              <Input label="Contraseña inicial" type="password" value={form.adminPassword} onChange={set('adminPassword')} required minLength={8} />

              {formError && <div className="sm:col-span-2"><ErrorText>{formError}</ErrorText></div>}

              <div className="sm:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? 'Creando…' : 'Crear empresa'}</Button>
              </div>
            </form>
          )}

          {!companies ? (
            <p className="text-sm text-gray-500">Cargando…</p>
          ) : (
            <Table columns={['Empresa', 'Usuarios', 'Proyectos activos', 'Plan', 'Creada', 'Estado', '']}>
              {companies.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-b border-gray-50">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-gray-900">{c.companyName}</div>
                      {c.contactEmail && <div className="text-xs text-gray-500">{c.contactEmail}</div>}
                    </td>
                    <td className="py-2 pr-3">{c.userCount}{c.maxUsers ? ` / ${c.maxUsers}` : ''}</td>
                    <td className="py-2 pr-3">{c.activeProjectCount}{c.maxActiveProjects ? ` / ${c.maxActiveProjects}` : ''}</td>
                    <td className="py-2 pr-3">{c.planTier}</td>
                    <td className="py-2 pr-3">{formatDate(c.createdAt)}</td>
                    <td className="py-2 pr-3">
                      <Badge color={c.active ? 'green' : 'red'}>{c.active ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                    <td className="py-2 pr-3 flex gap-2">
                      <Button type="button" variant="secondary" onClick={() => toggleActive(c)}>
                        {c.active ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => (editingPlanId === c.id ? setEditingPlanId(null) : startEditPlan(c))}
                      >
                        {editingPlanId === c.id ? 'Cancelar' : 'Editar plan'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!c.active || impersonating === c.id}
                        onClick={() => enterAsSupport(c)}
                      >
                        {impersonating === c.id ? 'Entrando…' : 'Entrar como soporte'}
                      </Button>
                    </td>
                  </tr>
                  {editingPlanId === c.id && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={7} className="py-3 px-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <Input label="Plan" value={planForm.planTier} onChange={setPlanField('planTier')} />
                          <Input
                            label="Máx. usuarios (vacío = sin límite)"
                            type="number" min="0"
                            value={planForm.maxUsers} onChange={setPlanField('maxUsers')}
                          />
                          <Input
                            label="Máx. proyectos activos (vacío = sin límite)"
                            type="number" min="0"
                            value={planForm.maxActiveProjects} onChange={setPlanField('maxActiveProjects')}
                          />
                          <Button type="button" onClick={() => submitPlan(c.id)} disabled={savingPlan}>
                            {savingPlan ? 'Guardando…' : 'Guardar'}
                          </Button>
                        </div>
                        {planError && <ErrorText>{planError}</ErrorText>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </Table>
          )}
        </Card>

        <div className="mt-6">
          <Card
            title="Historial de acceso de soporte"
            actions={<Button type="button" variant="secondary" onClick={toggleLog}>{showLog ? 'Ocultar' : 'Ver historial'}</Button>}
          >
            {showLog && (
              !supportLog ? (
                <p className="text-sm text-gray-500">Cargando…</p>
              ) : supportLog.length === 0 ? (
                <p className="text-sm text-gray-500">Sin accesos de soporte registrados todavía.</p>
              ) : (
                <Table columns={['Operador', 'Empresa', 'Usuario', 'Motivo', 'Fecha']}>
                  {supportLog.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50">
                      <td className="py-2 pr-3">{l.platformAdminName}</td>
                      <td className="py-2 pr-3">{l.companyName}</td>
                      <td className="py-2 pr-3">{l.impersonatedUserEmail}</td>
                      <td className="py-2 pr-3 text-gray-600">{l.reason || '—'}</td>
                      <td className="py-2 pr-3">{formatDateTime(l.createdAt)}</td>
                    </tr>
                  ))}
                </Table>
              )
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
