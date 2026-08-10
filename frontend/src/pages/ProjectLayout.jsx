import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { projectsApi } from '../api';
import { Badge } from '../components/ui';

export default function ProjectLayout() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');

  const TABS = [
    { to: 'contractual', label: t('projects.tabs.contractual') },
    { to: 'execution', label: t('projects.tabs.execution') },
    { to: 'personnel', label: t('projects.tabs.personnel') },
    { to: 'expenses', label: t('projects.tabs.expenses') },
    { to: 'reports', label: t('projects.tabs.reports') },
  ];

  useEffect(() => {
    projectsApi.get(projectId).then(setProject).catch((e) => setError(e?.response?.data?.message || t('common.loading')));
  }, [projectId]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!project) return <div className="text-gray-500">{t('projects.loadingProject')}</div>;

  return (
    <div>
      <div className="mb-4">
        <Link to="/" className="text-sm text-blue-600 hover:underline">{t('projects.backToProjects')}</Link>
        <div className="flex items-center flex-wrap gap-2 mt-1">
          <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          <Badge color={project.status === 'activo' ? 'green' : project.status === 'suspendido' ? 'yellow' : 'gray'}>
            {t(`enums.projectStatus.${project.status}`, project.status)}
          </Badge>
          {project.origin === 'cotizacion' && <Badge color="blue">{t('projects.fromQuotation')}</Badge>}
        </div>
        <p className="text-sm text-gray-500">{t('projects.client')}: {project.client || '-'}</p>
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
