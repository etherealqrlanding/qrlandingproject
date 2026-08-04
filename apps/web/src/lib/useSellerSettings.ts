import { useEffect, useState } from 'react';
import { sellerApi } from './sellerApi';

export type SellerSettingsData = Awaited<ReturnType<typeof sellerApi.settings>>;

// Cache a nivel de módulo — Catálogo, Nueva Reserva y Configuración lo consumen y no
// tiene sentido repetir el fetch cada vez que el vendedor navega entre esas páginas.
let _cached: SellerSettingsData | null = null;
let _pending: Promise<SellerSettingsData> | null = null;

export function useSellerSettings(): { data: SellerSettingsData | null; error: string | null } {
  const [data, setData] = useState<SellerSettingsData | null>(_cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cached) return;
    if (!_pending) _pending = sellerApi.settings();
    _pending
      .then((d) => { _cached = d; setData(d); })
      .catch((err) => setError((err as Error).message))
      .finally(() => { _pending = null; });
  }, []);

  return { data, error };
}

export function windowLabel(hours: number | null): string {
  if (hours == null) return 'Sin restricción';
  if (hours < 24) return `${hours} hs`;
  const days = hours / 24;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} día${days === 1 ? '' : 's'}`;
}
