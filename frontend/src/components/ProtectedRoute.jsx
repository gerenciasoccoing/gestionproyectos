import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, module, action }) {
  const { user, loading, can } = useAuth();
  const { t } = useTranslation();

  if (loading) return <div className="p-8 text-center text-gray-500">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (module && action && !can(module, action)) {
    return (
      <div className="p-8 text-center text-red-600">
        {t('common.noPermission')}
      </div>
    );
  }
  return children;
}
