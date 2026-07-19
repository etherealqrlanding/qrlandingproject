import { useState, useEffect } from 'react';
import { api } from './api';

// Número histórico como fallback, por si todavía no se configuró nada en el admin
// o falla la consulta — así el botón de WhatsApp nunca queda roto.
const DEFAULT_SUPPORT_WHATSAPP = '5491132368312';

let _cached: string | null = null;

export function useSupportWhatsapp(): string {
  const [number, setNumber] = useState(_cached ?? DEFAULT_SUPPORT_WHATSAPP);

  useEffect(() => {
    if (_cached !== null) return;
    api.settings.whatsapp()
      .then((d) => { if (d.number) { _cached = d.number; setNumber(d.number); } })
      .catch(() => {});
  }, []);

  return number;
}
