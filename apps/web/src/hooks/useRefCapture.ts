import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { REF_PARAM, isValidRef, storeRef } from '../lib/referral';

export function useRefCapture(): { freshCode: string | null; freshTick: number } {
  const [params, setParams] = useSearchParams();
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [freshTick, setFreshTick] = useState(0);

  useEffect(() => {
    const incoming = params.get(REF_PARAM);
    if (!incoming) return;
    if (isValidRef(incoming)) {
      storeRef(incoming);
      setFreshCode(incoming);
      setFreshTick((t) => t + 1); // siempre incrementa aunque el código sea el mismo
    }
    // Limpiamos el query param de la URL para no exponer el código al compartir
    const next = new URLSearchParams(params);
    next.delete(REF_PARAM);
    setParams(next, { replace: true });
  }, [params, setParams]);

  return { freshCode, freshTick };
}
