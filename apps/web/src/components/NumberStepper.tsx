import { useState } from 'react';

interface Props {
  value: number;
  min: number;
  max?: number;
  onChange: (v: number) => void;
  label?: string;
  cappedMessage?: string;
  decrementLabel?: string;
  incrementLabel?: string;
  // Versión más chica (botones y tipografía reducidos) para contextos con poco
  // espacio, como la preview de la card de opciones. El resto de los usos
  // (checkout, reservas manuales) quedan con el tamaño de siempre.
  compact?: boolean;
  // Sin caja (sin borde ni fondo): botones circulares sutiles y el valor suelto
  // en el medio, para contextos donde el look "input" pesa demasiado — hoy solo
  // la preview de la card de opciones. El resto sigue con la caja de siempre.
  bare?: boolean;
}

export default function NumberStepper({
  value, min, max, onChange, label, cappedMessage, decrementLabel = 'decrement', incrementLabel = 'increment', compact = false, bare = false,
}: Props) {
  const [showCapped, setShowCapped] = useState(false);

  const handleIncrement = () => {
    if (max != null && value >= max) {
      if (cappedMessage) {
        setShowCapped(true);
        setTimeout(() => setShowCapped(false), 2500);
      }
      return;
    }
    onChange(max != null ? Math.min(max, value + 1) : value + 1);
  };

  if (bare) {
    return (
      <div>
        {label && <span className="block text-xs text-cream/80 mb-1">{label}</span>}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, value - 1))}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full border border-gold/25 text-base text-gold-soft hover:text-gold hover:border-gold/50 hover:bg-gold/10 transition"
            aria-label={decrementLabel}
          >−</button>
          <span className="min-w-[1.5ch] text-center text-sm text-cream tabular-nums">{value}</span>
          <button
            type="button"
            onClick={handleIncrement}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full border border-gold/25 text-base text-gold-soft hover:text-gold hover:border-gold/50 hover:bg-gold/10 transition"
            aria-label={incrementLabel}
          >+</button>
        </div>
        {showCapped && cappedMessage && (
          <p className="mt-1 text-xs text-gold-soft">{cappedMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {label && (
        <span className={`block text-cream/80 ${compact ? 'text-xs mb-1' : 'text-sm mb-1.5'}`}>{label}</span>
      )}
      <div className={`flex items-center rounded-md border border-gold/20 bg-ink/40 overflow-hidden ${compact ? 'text-sm' : ''}`}>
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className={`text-cream hover:bg-gold/10 transition ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
          aria-label={decrementLabel}
        >−</button>
        <span className="flex-1 text-center text-cream tabular-nums">{value}</span>
        <button
          type="button"
          onClick={handleIncrement}
          className={`text-cream hover:bg-gold/10 transition ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
          aria-label={incrementLabel}
        >+</button>
      </div>
      {showCapped && cappedMessage && (
        <p className="mt-1 text-xs text-gold-soft">{cappedMessage}</p>
      )}
    </div>
  );
}
