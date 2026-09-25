import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { projectPaymentsApi, projectsApi } from '../api';
import { Button, ErrorText, extractError, money } from './ui';

const MIN_OBSERVATION_LENGTH = 10;

// Se abre solo cuando un ADMIN cierra un proyecto con saldo real pendiente (ver ProjectLayout.jsx):
// cualquier otro caso (saldo <= 0, o un usuario sin el rol admin) nunca llega acá — el backend
// (projectController.js#update) vuelve a validar exactamente lo mismo, así que este modal es
// ayuda de interfaz, no el control de acceso real.
export default function CloseProjectModal({ projectId, onClose, onClosed }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(null);
  const [observation, setObservation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { projectPaymentsApi.summary(projectId).then(setSummary); }, [projectId]);

  const confirm = async () => {
    setError('');
    if (observation.trim().length < MIN_OBSERVATION_LENGTH) {
      setError(t('projects.closeModal.observationTooShort', { min: MIN_OBSERVATION_LENGTH }));
      return;
    }
    setSaving(true);
    try {
      const updated = await projectsApi.update(projectId, { status: 'terminado', closeObservation: observation.trim() });
      onClosed(updated);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-1">{t('projects.closeModal.title')}</h2>
        <p className="text-sm text-gray-500 mb-3">{t('projects.closeModal.help')}</p>

        {!summary ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3 bg-gray-50 border rounded p-2">
              <div><span className="text-gray-500">{t('payments.summary.executedValue')}:</span> <span className="font-medium">{money(summary.executedValue)}</span></div>
              <div><span className="text-gray-500">{t('payments.summary.totalGross')}:</span> <span className="font-medium">{money(summary.totalGross)}</span></div>
              <div><span className="text-gray-500">{t('payments.summary.totalWithholdings')}:</span> <span className="font-medium">{money(summary.totalWithholdings)}</span></div>
              <div><span className="text-gray-500">{t('payments.summary.totalNet')}:</span> <span className="font-medium">{money(summary.totalNet)}</span></div>
              <div className="col-span-2 border-t pt-1"><span className="text-gray-500">{t('payments.summary.saldoReal')}:</span> <span className="font-semibold text-yellow-700">{money(summary.saldoReal)}</span></div>
            </div>

            {summary.recoverablePending > 0 && (
              <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2 mb-3">
                {t('projects.closeModal.recoverableWarning', { amount: money(summary.recoverablePending) })}
              </p>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">{t('projects.closeModal.observationLabel')}</label>
            <textarea
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              rows={3}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder={t('projects.closeModal.observationPlaceholder')}
              autoFocus
            />
            <ErrorText>{error}</ErrorText>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
              <Button onClick={confirm} loading={saving}>{t('projects.closeModal.confirm')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
