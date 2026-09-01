import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { projectsApi } from '../api';
import { Badge, Button, Input, ErrorText, extractError } from '../components/ui';
import { fileUrl } from '../api/client';
import Can from '../components/Can';
import { useAuth } from '../context/AuthContext';
import ConsortiumSelect from '../components/ConsortiumSelect';

export default function ProjectLayout() {
  const { t } = useTranslation();
  const { hasFeature, can, isAdmin } = useAuth();
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingConsortium, setEditingConsortium] = useState(false);
  const [consortiumDraft, setConsortiumDraft] = useState('');
  const [consortiumError, setConsortiumError] = useState('');

  const TABS = [
    { to: 'contractual', label: t('projects.tabs.contractual') },
    { to: 'execution', label: t('projects.tabs.execution') },
    { to: 'personnel', label: t('projects.tabs.personnel') },
    { to: 'expenses', label: t('projects.tabs.expenses') },
    // Módulo "plus" (ver Company.enabledFeatures): el tab ni aparece si la empresa no lo tiene
    // activado, sin importar el permiso del usuario (isAdmin incluido) — mismo criterio que
    // requireFeature en el backend.
    ...(hasFeature('estudio_mercado') && (isAdmin || can('estudio_mercado', 'view'))
      ? [{ to: 'market-study', label: t('projects.tabs.marketStudy') }]
      : []),
    { to: 'reports', label: t('projects.tabs.reports') },
  ];

  useEffect(() => {
    projectsApi.get(projectId).then(setProject).catch((e) => setError(e?.response?.data?.message || t('common.loading')));
  }, [projectId]);

  const startEditName = () => {
    setNameDraft(project.name);
    setNameError('');
    setEditingName(true);
  };

  const saveName = async (e) => {
    e.preventDefault();
    setNameError('');
    setSaving(true);
    try {
      const updated = await projectsApi.update(projectId, { name: nameDraft.trim() });
      setProject(updated);
      setEditingName(false);
    } catch (err) {
      setNameError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const startEditConsortium = () => {
    setConsortiumDraft(project.consortiumId || '');
    setConsortiumError('');
    setEditingConsortium(true);
  };

  const saveConsortium = async () => {
    setConsortiumError('');
    setSaving(true);
    try {
      const updated = await projectsApi.update(projectId, { consortiumId: consortiumDraft || null });
      setProject(updated);
      setEditingConsortium(false);
    } catch (err) {
      setConsortiumError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="text-red-600">{error}</div>;
  if (!project) return <div className="text-gray-500">{t('projects.loadingProject')}</div>;

  return (
    <div>
      <div className="mb-4">
        <Link to="/" className="text-sm text-blue-600 hover:underline">{t('projects.backToProjects')}</Link>
        {editingName ? (
          <form onSubmit={saveName} className="flex items-center flex-wrap gap-2 mt-1">
            <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} required autoFocus className="max-w-sm" />
            <Button type="submit" disabled={saving}>{t('common.save')}</Button>
            <Button type="button" variant="secondary" onClick={() => setEditingName(false)}>{t('common.cancel')}</Button>
          </form>
        ) : (
          <div className="flex items-center flex-wrap gap-2 mt-1">
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            <Badge color={project.status === 'activo' ? 'green' : project.status === 'suspendido' ? 'yellow' : 'gray'}>
              {t(`enums.projectStatus.${project.status}`, project.status)}
            </Badge>
            {project.origin === 'cotizacion' && <Badge color="blue">{t('projects.fromQuotation')}</Badge>}
            <Can module="proyectos" action="edit">
              <Button variant="secondary" onClick={startEditName}>{t('common.edit')}</Button>
            </Can>
          </div>
        )}
        {editingName && <ErrorText>{nameError}</ErrorText>}
        <p className="text-sm text-gray-500">{t('projects.client')}: {project.client || '-'}</p>

        <div className="flex items-center flex-wrap gap-2 mt-1">
          {!editingConsortium ? (
            <>
              {project.consortium?.logoPath && <img src={fileUrl(project.consortium.logoPath)} alt={project.consortium.name} className="h-6" />}
              <p className="text-sm text-gray-500">
                {t('projects.consortium.label')}: {project.consortium ? project.consortium.name : t('projects.consortium.mainCompany')}
              </p>
              <Can module="proyectos" action="edit">
                <Button variant="secondary" onClick={startEditConsortium}>{t('common.edit')}</Button>
              </Can>
            </>
          ) : (
            <div className="flex items-end gap-2">
              <ConsortiumSelect value={consortiumDraft} onChange={setConsortiumDraft} />
              <Button onClick={saveConsortium} disabled={saving}>{t('common.save')}</Button>
              <Button variant="secondary" onClick={() => setEditingConsortium(false)}>{t('common.cancel')}</Button>
            </div>
          )}
        </div>
        {editingConsortium && <ErrorText>{consortiumError}</ErrorText>}
      </div>

      <nav className="flex gap-1 border-b border-gray-300 mb-4 overflow-x-auto whitespace-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `shrink-0 px-4 py-2 text-sm font-medium border-b-2 ${isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ project, projectId }} />
    </div>
  );
}
