import { useState } from 'react';

// Bloque compacto para copiar / enviar por WhatsApp un link de pago de Mercado Pago.
// Reutilizado en el detalle de orden (admin) y en Mis Ventas (vendedor).
interface Props {
  link: string;
  waMessage: string;
  phone?: string | null;
  label?: string;
}

export default function PaymentLinkShare({ link, waMessage, phone, label }: Readonly<Props>) {
  const [copied, setCopied] = useState(false);
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  const waUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(waMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-[10px] uppercase tracking-wider text-gold-soft">{label}</p>}
      <div className="flex items-center gap-2 rounded-lg border border-gold/20 bg-ink/40 p-2">
        <span className="flex-1 truncate text-left text-xs text-cream/60 px-1">{link}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); copy(); }}
          className="shrink-0 rounded-md border border-gold/30 px-3 py-1.5 text-xs text-cream hover:bg-gold/10 transition">
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
      <a href={waUrl} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-ink hover:brightness-95 transition">
        Enviar por WhatsApp{phoneDigits ? ' al pasajero' : ''}
      </a>
    </div>
  );
}
