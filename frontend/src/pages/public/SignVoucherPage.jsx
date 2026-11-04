import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { voucherSignatureApi } from '../../api';
import { Button } from '../../components/ui';
import Logo from '../../components/Logo';
import useSubmitGuard from '../../hooks/useSubmitGuard';

// Página pública (sin login) a la que llega quien debe firmar un rol de un comprobante de
// egreso/ingreso (ver voucherSignatureService.js) — mismo patrón exacto que SignContractPage.jsx:
// solo el token de la URL identifica qué firmar, nada de navegación ni de otros datos de la empresa.
export default function SignVoucherPage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    voucherSignatureApi.get(token)
      .then(setInfo)
      .catch((err) => setError(err.response?.data?.message || t('signVoucher.notFound')))
      .finally(() => setLoading(false));
  }, [token]);

  // Firma dibujada a mano sobre un <canvas>: mismo mecanismo (sin librería externa) que
  // SignContractPage.jsx.
  useEffect(() => {
    if (!info || info.status !== 'pendiente') return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    };
    const start = (e) => { drawingRef.current = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasDrawn(true);
    };
    const end = () => { drawingRef.current = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: true });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, [info]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // useSubmitGuard evita el doble clic al firmar (mismo mecanismo que el resto de la app).
  const [submit, submitting] = useSubmitGuard(async () => {
    setError('');
    if (!signerName.trim()) { setError(t('signVoucher.nameRequired')); return; }
    if (!hasDrawn) { setError(t('signVoucher.signatureRequired')); return; }
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const res = await voucherSignatureApi.sign(token, { signatureDataUrl: dataUrl, signerName: signerName.trim() });
      setInfo((i) => ({ ...i, status: 'firmado', signedAt: res.signedAt }));
    } catch (err) {
      setError(err.response?.data?.message || t('signVoucher.signFailed'));
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
              <h1 className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('signVoucher.title', { role: info.roleLabel })}</h1>
              <p className="text-sm text-gray-500 text-center mb-4">{info.voucherLabel}{info.projectName ? ` · ${info.projectName}` : ''}</p>

              {info.status === 'firmado' ? (
                <>
                  <p className="text-center text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg py-3 px-4 mb-4">
                    {t('signVoucher.alreadySigned', { date: info.signedAt ? new Date(info.signedAt).toLocaleString('es-CO') : '' })}
                  </p>
                  <a href={voucherSignatureApi.documentUrl(token)} target="_blank" rel="noreferrer" className="block text-center text-sm text-blue-600 hover:underline">
                    {t('signVoucher.viewDocument')}
                  </a>
                </>
              ) : info.status === 'vencido' ? (
                <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg py-3 px-4">{t('signVoucher.expired')}</p>
              ) : (
                <>
                  <a href={voucherSignatureApi.documentUrl(token)} target="_blank" rel="noreferrer" className="block text-center text-sm text-blue-600 hover:underline mb-4">
                    {t('signVoucher.viewDocument')}
                  </a>
                  <label className="block text-sm text-gray-600 mb-1">{t('signVoucher.fullName')}</label>
                  <input
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                  <label className="block text-sm text-gray-600 mb-1">{t('signVoucher.drawHere')}</label>
                  <canvas
                    ref={canvasRef}
                    width={340}
                    height={140}
                    className="w-full border border-gray-300 rounded bg-gray-50 mb-2"
                    style={{ touchAction: 'none' }}
                  />
                  <button type="button" className="text-xs text-gray-500 hover:underline mb-4" onClick={clearSignature}>
                    {t('signVoucher.clear')}
                  </button>
                  {error && <p className="text-center text-sm text-red-600 mb-3">{error}</p>}
                  <Button type="button" className="w-full py-2.5 rounded-lg" onClick={submit} loading={submitting}>
                    {t('signVoucher.confirmSign')}
                  </Button>
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
