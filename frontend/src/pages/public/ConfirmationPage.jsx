import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inventoryConfirmationsApi } from '../../api';
import { Button, formatDateTime } from '../../components/ui';
import Logo from '../../components/Logo';

// Página pública (sin login) a la que llega la persona responsable desde el enlace de WhatsApp.
// Solo muestra el resumen del movimiento correspondiente a su token y un botón de confirmación —
// nada de navegación, nada de otros movimientos/equipos/usuarios de la app.
export default function ConfirmationPage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    inventoryConfirmationsApi.get(token)
      .then(setSummary)
      .catch((err) => setError(err.response?.data?.message || t('publicConfirmation.notFound')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const confirm = async () => {
    setConfirming(true);
    setError('');
    try {
      const res = await inventoryConfirmationsApi.confirm(token);
      setSummary(res);
    } catch (err) {
      setError(err.response?.data?.message || t('publicConfirmation.confirmFailed'));
    } finally {
      setConfirming(false);
    }
  };

  const title = summary?.kind === 'entrada' ? t('publicConfirmation.titleEntrada') : t('publicConfirmation.titleSalida');
  const confirmLabel = summary?.kind === 'entrada' ? t('publicConfirmation.buttonEntrada') : t('publicConfirmation.buttonSalida');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size={48} />
        </div>

        <div className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
          {loading && <p className="text-center text-sm text-gray-500">{t('common.loading')}</p>}

          {!loading && error && !summary && (
            <p className="text-center text-sm text-red-600">{error}</p>
          )}

          {!loading && summary && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-4 text-center">{title}</h1>

              <dl className="text-sm text-gray-700 flex flex-col gap-2 mb-6">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">{t('publicConfirmation.destino')}</dt>
                  <dd className="text-right font-medium">{summary.destino}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">{t('publicConfirmation.responsable')}</dt>
                  <dd className="text-right font-medium">{summary.responsable}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">{t('publicConfirmation.fecha')}</dt>
                  <dd className="text-right font-medium">{formatDateTime(summary.fecha)}</dd>
                </div>
                {summary.autorizadoPor && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">{t('publicConfirmation.autorizadoPor')}</dt>
                    <dd className="text-right font-medium">{summary.autorizadoPor}</dd>
                  </div>
                )}
              </dl>

              <p className="text-xs font-medium text-gray-500 mb-1">{t('publicConfirmation.equipos')}</p>
              <ul className="text-sm text-gray-800 border rounded-lg divide-y divide-gray-100 mb-6">
                {summary.items.map((it, i) => (
                  <li key={i} className="px-3 py-2 flex justify-between gap-2">
                    <span>{it.name} <span className="text-gray-400">({it.code})</span></span>
                    <span className="text-gray-500">x{it.quantity}</span>
                  </li>
                ))}
              </ul>

              {summary.status === 'confirmado' ? (
                <p className="text-center text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg py-3 px-4">
                  {t('publicConfirmation.alreadyConfirmed', { date: formatDateTime(summary.confirmedAt) })}
                </p>
              ) : summary.expired ? (
                <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg py-3 px-4">
                  {t('publicConfirmation.expired')}
                </p>
              ) : (
                <>
                  <Button type="button" className="w-full py-2.5 rounded-lg" onClick={confirm} disabled={confirming}>
                    {confirming ? t('publicConfirmation.confirming') : confirmLabel}
                  </Button>
                  {error && <p className="text-center text-sm text-red-600 mt-3">{error}</p>}
                </>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">ERGY-PROJECT</p>
      </div>
    </div>
  );
}
