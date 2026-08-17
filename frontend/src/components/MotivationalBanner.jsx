import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getMotivationalGroup, getDailyMessageKey } from '../data/motivationalMessages';

// Frase motivacional del día en el dashboard: distinta según si el usuario es administrador/líder
// de proyecto o no (ver getMotivationalGroup), y rotada automáticamente por fecha (sin acción del
// usuario ni estado propio del componente).
export default function MotivationalBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;

  const group = getMotivationalGroup(user);
  const key = getDailyMessageKey(group);
  const message = t(`motivational.${group}.${key}`);

  return (
    <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex items-start gap-3">
      <span className="shrink-0 mt-0.5 text-blue-600">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v2M18.4 5.6l-1.4 1.4M21 12h-2M17 17l1.4 1.4M12 19v2M5.6 18.4L7 17M3 12h2M6.6 7l-1.4-1.4" />
          <circle cx="12" cy="12" r="4.5" />
        </svg>
      </span>
      <p className="text-sm text-blue-900 leading-relaxed">{message}</p>
    </div>
  );
}
