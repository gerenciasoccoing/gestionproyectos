import { useCallback, useRef, useState } from 'react';

// Evita que un doble clic en "Guardar" (o cualquier acción que envíe una petición) dispare dos
// veces el mismo handler — el caso típico de duplicados por doble clic, incluso cuando el usuario
// hace clic dos veces porque percibió que el primero "no funcionó" al no ver cambio inmediato en
// pantalla. La guardia usa un useRef (no solo el estado `submitting`) porque una actualización de
// estado en React no es síncrona: un segundo clic muy rápido podría llegar antes de que el
// re-render deshabilite el botón. El ref sí bloquea de inmediato.
//
// Complementa (no reemplaza) la protección del backend (ver middleware/idempotency.js): esta
// guardia cubre el caso normal, esa otra cubre el caso en que el frontend fallara en deshabilitar
// el botón a tiempo.
export default function useSubmitGuard(handler) {
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const guarded = useCallback(async (...args) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setSubmitting(true);
    try {
      return await handler(...args);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [handler]);

  return [guarded, submitting];
}
