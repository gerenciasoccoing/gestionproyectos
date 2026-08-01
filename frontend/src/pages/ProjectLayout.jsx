import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { projectsApi } from '../api';
import { Badge } from '../components/ui';

const TABS = [
  { to: 'contractual', label: 'Contractual' },
  { to: 'execution', label: 'Ejecución' },
  { to: 'personnel', label: 'Personal' },
  { to: 'expenses', label: 'Gastos' },
  { to: 'reports', label: 'Informes' },
];

export default function ProjectLayout() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    projectsApi.get(projectId).then(setProject).catch((e) => setError(e?.response?.data?.message || 'Error cargando proyecto'));
  }, [projectId]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!project) return <div className="text-gray-500">Cargando proyecto...</div>;

  return (
    <div>
      <div className="mb-4">
        <Link to="/" className="text-sm text-blue-600 hover:underline">&larr; Volver a proyectos</Link>
        <div className="flex items-center flex-wrap gap-2 mt-1">
          <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          <Badge color={project.status === 'activo' ? 'green' : project.status === 'suspendido' ? 'yellow' : 'gray'}>
            {project.status}
          </Badge>
          {project.origin === 'cotizacion' && <Badge color="blue">Desde cotización</Badge>}
        </div>
        <p className="text-sm text-gray-500">Cliente: {project.client || '-'}</p>
      </div>

      <nav className="flex gap-1 border-b border-gray-300 mb-4 overflow-x-auto whitespace-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `shrink-0 px-4 py-2 text-sm font-medium border-b-2 ${isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ project, projectId }} />
    </div>
  );
}
