import { useState } from 'react';

// Botón de compartir: usa el share nativo del sistema (WhatsApp, Telegram, Mensajes, etc.)
// cuando el dispositivo lo soporta; si no, cae en el mismo patrón de copiar + WhatsApp
// que ya usa el sitio en PaymentLinkShare / SellerDashboard.
interface Props {
  url: string;
  title?: string;
  waMessage: string;
  label: string;
  className?: string;
}

const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export default function ShareButton({ url, title, waMessage, label, className }: Readonly<Props>) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (canNativeShare) {
      try {
        await navigator.share({ title, text: waMessage, url });
      } catch { /* usuario canceló o share no disponible */ }
      return;
    }
    setShowFallback((v) => !v);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-md border border-gold/25 bg-gold/5 px-3 py-1.5 text-xs text-gold-soft hover:bg-gold/15 transition whitespace-nowrap"
      >
        {label}
      </button>

      {!canNativeShare && showFallback && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-gold/20 bg-ink/40 p-2">
            <span className="flex-1 truncate text-left text-xs text-cream/60 px-1">{url}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); copy(); }}
              className="shrink-0 rounded-md border border-gold/30 px-3 py-1.5 text-xs text-cream hover:bg-gold/10 transition">
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-ink hover:brightness-95 transition">
            Enviar por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
