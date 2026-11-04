import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorText, extractError } from './ui';
import useSubmitGuard from '../hooks/useSubmitGuard';

// Firma a mano sobre un <canvas>, igual mecanismo (sin librería externa) que SignContractPage.jsx/
// SignVoucherPage.jsx — acá en miniatura, embebido en la fila de un rol en vez de página completa.
function MiniSignaturePad({ onCancel, onConfirm, submitting }) {
  const { t } = useTranslation();
  const [signerName, setSignerName] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
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
  }, []);

  const confirm = async () => {
    setError('');
    if (!signerName.trim()) { setError(t('voucherSignature.nameRequired')); return; }
    if (!hasDrawn) { setError(t('voucherSignature.signatureRequired')); return; }
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      await onConfirm({ signatureDataUrl: dataUrl, signerName: signerName.trim() });
    } catch (err) {
      setError(extractError(err));
    }
  };

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded p-3 mt-2">
      <label className="block text-xs text-gray-600 mb-1">{t('voucherSignature.fullName')}</label>
      <input
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2"
        value={signerName}
        onChange={(e) => setSignerName(e.target.value)}
      />
      <canvas
        ref={canvasRef}
        width={300}
        height={100}
        className="w-full max-w-[300px] border border-gray-300 rounded bg-white mb-1"
        style={{ touchAction: 'none' }}
      />
      <div className="flex gap-2 items-center">
        <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => { canvasRef.current.getContext('2d').clearRect(0, 0, 300, 100); setHasDrawn(false); }}>
          {t('voucherSignature.clear')}
        </button>
        <Button type="button" className="text-xs px-3 py-1" onClick={confirm} loading={submitting}>{t('voucherSignature.confirmSign')}</Button>
        <button type="button" className="text-xs text-gray-500 hover:underline" onClick={onCancel}>{t('common.cancel')}</button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// Sección "Firmas" del detalle de un gasto/ingreso: muestra el estado de cada rol (pendiente/
// firmado) y ofrece firmarlo dentro de la app (usuario ya autenticado, sin enlace) o enviarlo a
// firmar por un enlace público (para alguien sin cuenta, p. ej. el proveedor). roles es
// [{ role, label }]; api expone { signatures(), sign(role, data), requestSignature(role, email) }.
export default function VoucherSignaturePanel({ roles, api, disabled, defaultEmail }) {
  const { t } = useTranslation();
  const [signatures, setSignatures] = useState(null);
  const [error, setError] = useState('');
  const [signingRole, setSigningRole] = useState(null);
  const [linkRole, setLinkRole] = useState(null);
  const [email, setEmail] = useState('');
  const [linkResult, setLinkResult] = useState(null);

  const load = () => api.signatures().then(setSignatures).catch((err) => setError(extractError(err)));
  useEffect(() => { load(); }, []);

  const [doSign, signing] = useSubmitGuard(async (role, data) => {
    await api.sign(role, data);
    setSigningRole(null);
    await load();
  });

  const [doRequest, requesting] = useSubmitGuard(async (role) => {
    setError('');
    setLinkResult(null);
    try {
      const res = await api.requestSignature(role, email.trim() || null);
      setLinkResult(res);
    } catch (err) {
      setError(extractError(err));
    }
  });

  if (!signatures) return <p className="text-xs text-gray-400">{t('common.loading')}</p>;

  const byRole = new Map(signatures.map((s) => [s.role, s]));

  return (
    <div className="space-y-2">
      <ErrorText>{error}</ErrorText>
      {roles.map(({ role, label }) => {
        const sig = byRole.get(role);
        const firmado = sig?.status === 'firmado';
        return (
          <div key={role} className="text-sm border-b border-gray-100 pb-2 last:border-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-medium">{label}:</span>{' '}
                {firmado ? (
                  <span className="text-green-700">{t('voucherSignature.signedBy', { name: sig.signerName, date: sig.signedAt ? new Date(sig.signedAt).toLocaleString('es-CO') : '' })}</span>
                ) : (
                  <span className="text-gray-500">{t('voucherSignature.pending')}</span>
                )}
              </div>
              {!firmado && !disabled && (
                <div className="flex gap-2 shrink-0">
                  <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setSigningRole(signingRole === role ? null : role); setLinkRole(null); }}>
                    {t('voucherSignature.signNow')}
                  </button>
                  <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setLinkRole(linkRole === role ? null : role); setSigningRole(null); setEmail(defaultEmail || ''); setLinkResult(null); }}>
                    {t('voucherSignature.sendToSign')}
                  </button>
                </div>
              )}
            </div>

            {signingRole === role && (
              <MiniSignaturePad
                submitting={signing}
                onCancel={() => setSigningRole(null)}
                onConfirm={(data) => doSign(role, data)}
              />
            )}

            {linkRole === role && (
              <div className="border border-blue-200 bg-blue-50/50 rounded p-3 mt-2">
                <label className="block text-xs text-gray-600 mb-1">{t('voucherSignature.email')}</label>
                <input type="email" className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2" value={email} onChange={(e) => setEmail(e.target.value)} />
                <div className="flex gap-2 items-center">
                  <Button type="button" className="text-xs px-3 py-1" onClick={() => doRequest(role)} loading={requesting}>{t('voucherSignature.generateLink')}</Button>
                  <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setLinkRole(null)}>{t('common.cancel')}</button>
                </div>
                {linkResult && (
                  <div className="text-xs mt-2">
                    {linkResult.emailSent && <p className="text-green-700">{t('voucherSignature.emailSent')}</p>}
                    {!linkResult.emailSent && email && <p className="text-amber-700">{t('voucherSignature.emailFailed')}</p>}
                    <p className="text-gray-600 break-all mt-1">{t('voucherSignature.copyLink')}: <a className="text-blue-600 hover:underline" href={linkResult.signUrl} target="_blank" rel="noreferrer">{linkResult.signUrl}</a></p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
