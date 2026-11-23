import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { materialSignatureApi } from '../../api';
import { Button, ErrorText, extractError } from '../../components/ui';
import Logo from '../../components/Logo';
import SignaturePad from '../../components/SignaturePad';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const MOVEMENT_LABELS = { traslado: 'Traslado de material', salida: 'Salida de material', devolucion: 'Devolución de material' };

// Página pública (sin login) para confirmar o rechazar un traslado/salida/devolución del Inventario
// de Materiales por el enlace enviado por WhatsApp/correo — mismo patrón que SignVoucherPage.jsx/
// SignContractPage.jsx. Acepta "tal como se envió" o rechaza con motivo; ajustar cantidades
// línea por línea (faltante parcial) se hace desde la plataforma (ver MaterialTransfersPage.jsx).
export default function SignMaterialPage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    materialSignatureApi.get(token)
      .then(setInfo)
      .catch((err) => setError(err.response?.data?.message || t('signVoucher.notFound')))
      .finally(() => setLoading(false));
  }, [token]);

  const [doSign, signing] = useSubmitGuard(async ({ signatureDataUrl, signerName }) => {
    const res = await materialSignatureApi.sign(token, { signatureDataUrl, signerName });
    setInfo((i) => ({ ...i, status: 'firmado', signedAt: res.signedAt }));
  });

  const [doReject, rejecting] = useSubmitGuard(async () => {
    setError('');
    if (!rejectionReason.trim()) { setError(t('materialsInventory.transfers.rejectReasonRequired')); return; }
    try {
      const res = await materialSignatureApi.reject(token, rejectionReason);
      setInfo((i) => ({ ...i, status: 'rechazado', rejectedAt: res.rejectedAt }));
    } catch (err) {
      setError(extractError(err));
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6"><Logo size={48} /></div>

        <div className="bg-white shadow-xl shadow-blue-950/5 border border-gray-100 rounded-2xl p-8">
          {loading && <p className="text-center text-sm text-gray-500">{t('common.loading')}</p>}
          {!loading && error && !info && <p className="text-center text-sm text-red-600">{error}</p>}

          {!loading && info && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-4 text-center">{MOVEMENT_LABELS[info.movementType] || t('materialsInventory.title')}</h1>

              {info.status === 'firmado' ? (
                <>
                  <p className="text-center text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg py-3 px-4 mb-4">
                    {t('signVoucher.alreadySigned', { date: info.signedAt ? new Date(info.signedAt).toLocaleString('es-CO') : '' })}
                  </p>
                  <a href={materialSignatureApi.documentUrl(token)} target="_blank" rel="noreferrer" className="block text-center text-sm text-blue-600 hover:underline">
                    {t('signVoucher.viewDocument')}
                  </a>
                </>
              ) : info.status === 'rechazado' ? (
                <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg py-3 px-4">{t('materialsInventory.transfers.alreadyRejected')}</p>
              ) : info.status === 'vencido' ? (
                <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg py-3 px-4">{t('signVoucher.expired')}</p>
              ) : (
                <>
                  <a href={materialSignatureApi.documentUrl(token)} target="_blank" rel="noreferrer" className="block text-center text-sm text-blue-600 hover:underline mb-4">
                    {t('signVoucher.viewDocument')}
                  </a>

                  {!showReject ? (
                    <>
                      <SignaturePad onSubmit={doSign} submitting={signing} submitLabel={t('materialsInventory.transfers.acceptAndSign')} />
                      <button type="button" className="text-xs text-red-600 hover:underline mt-3 block mx-auto" onClick={() => setShowReject(true)}>
                        {t('materialsInventory.transfers.rejectAction')}
                      </button>
                    </>
                  ) : (
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">{t('materialsInventory.transfers.rejectReason')}</label>
                      <textarea className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2" rows={3} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
                      <ErrorText>{error}</ErrorText>
                      <div className="flex gap-2">
                        <Button type="button" variant="danger" className="flex-1" onClick={doReject} loading={rejecting}>{t('materialsInventory.transfers.rejectAction')}</Button>
                        <Button type="button" variant="secondary" onClick={() => setShowReject(false)}>{t('common.cancel')}</Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-3 text-center">{t('signVoucher.legalNote')}</p>
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
