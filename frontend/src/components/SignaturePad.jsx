import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorText } from './ui';

// Firma dibujada a mano sobre un <canvas> — mismo mecanismo (sin librería externa, mouse y touch)
// que SignContractPage.jsx/SignVoucherPage.jsx/VoucherSignaturePanel.jsx, extraído acá como
// componente reusable para el Inventario de Materiales (traslados/salidas/devoluciones), tanto en
// la página pública de firma como en los formularios de confirmación dentro de la app.
export default function SignaturePad({ onSubmit, submitting, submitLabel, width = 320, height = 130 }) {
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

  const clear = () => {
    canvasRef.current.getContext('2d').clearRect(0, 0, width, height);
    setHasDrawn(false);
  };

  const submit = async () => {
    setError('');
    if (!signerName.trim()) { setError(t('voucherSignature.nameRequired')); return; }
    if (!hasDrawn) { setError(t('voucherSignature.signatureRequired')); return; }
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      await onSubmit({ signatureDataUrl: dataUrl, signerName: signerName.trim() });
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{t('voucherSignature.fullName')}</label>
      <input className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full border border-gray-300 rounded bg-gray-50 mb-1"
        style={{ touchAction: 'none' }}
      />
      <button type="button" className="text-xs text-gray-500 hover:underline mb-2 block" onClick={clear}>{t('voucherSignature.clear')}</button>
      <ErrorText>{error}</ErrorText>
      <Button type="button" className="w-full" onClick={submit} loading={submitting}>{submitLabel || t('voucherSignature.confirmSign')}</Button>
    </div>
  );
}
