import type { ReactNode } from 'react';
import { Listbox, ListboxButton, ListboxLabel, ListboxOption, ListboxOptions } from '@headlessui/react';

export interface QuickSelectOption {
  value: string;
  label: string;
  /** Precio corto alineado a la derecha del nombre, ej. "USD 63". */
  price?: string;
  /** Chips ícono + palabra (ej. "Cena", "Traslado") — no emojis. */
  tags?: { icon: ReactNode; label: string }[];
  /** Línea secundaria compacta (servicios de la casa, descripción del servicio). Hace quiebre de línea, no se corta. */
  meta?: string;
  /** Miniatura a la izquierda de la opción (ej. hero_image de la casa). undefined = sin columna de miniatura. */
  thumbnail?: string | null;
}

interface QuickSelectProps {
  label: string;
  icon: ReactNode;
  placeholder: string;
  options: QuickSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Selector a medida (Headless UI Listbox) para el hero: el <select> nativo no
 * permite restylear la lista desplegada (queda blanca, del SO). Con esto el
 * panel abierto también respeta la paleta oscura/dorada de la marca.
 */
export default function QuickSelect({
  label, icon, placeholder, options, value, onChange, disabled, loading,
}: QuickSelectProps) {
  const selected = options.find((o) => o.value === value) ?? null;
  const isDisabled = Boolean(disabled) || options.length === 0;

  return (
    <Listbox value={value} onChange={onChange} disabled={isDisabled}>
      <ListboxLabel className="block text-xs uppercase tracking-[0.25em] text-gold-soft mb-2">
        {label}
      </ListboxLabel>
      <div className="relative">
        <ListboxButton
          className={`w-full flex items-center gap-3 rounded-md border px-4 py-3.5 text-left transition ${
            isDisabled
              ? 'border-gold/10 bg-ink/40 text-cream/30 cursor-not-allowed'
              : 'border-gold/30 bg-ink text-cream hover:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/40 focus:border-gold/60'
          } ${loading ? 'animate-pulse' : ''}`}
        >
          {({ open }) => (
            <>
              <span className={isDisabled ? 'shrink-0 text-cream/20' : 'shrink-0 text-gold'}>
                {icon}
              </span>
              <span className="flex-1 font-medium text-sm leading-snug">
                {selected ? selected.label : placeholder}
              </span>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="none"
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${
                  isDisabled ? 'text-cream/20' : 'text-gold'
                }`}
              >
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </ListboxButton>

        <ListboxOptions
          transition
          modal={false}
          className="absolute z-50 top-full left-0 mt-2 w-full max-h-96 overflow-auto rounded-lg border border-gold/25 bg-ink-soft py-1.5 shadow-2xl shadow-black/50 focus:outline-none transition duration-150 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1"
        >
          {options.map((opt) => (
            <ListboxOption
              key={opt.value}
              value={opt.value}
              className="cursor-pointer select-none px-4 py-2.5 flex items-center justify-between gap-3 text-cream/90 data-[focus]:bg-gold/10 data-[selected]:text-gold"
            >
              {({ selected: isSelected }) => (
                <>
                  {opt.thumbnail !== undefined && (
                    <span className="shrink-0 h-10 w-10 rounded-md overflow-hidden bg-ink border border-gold/10">
                      {opt.thumbnail ? (
                        <img src={opt.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-cream/15">{icon}</span>
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm leading-snug">{opt.label}</span>
                      {opt.price && (
                        <span className="shrink-0 text-right text-[11px] font-medium leading-tight text-gold/90 pt-0.5">
                          {opt.price}
                        </span>
                      )}
                    </span>
                    {opt.tags && opt.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {opt.tags.map((tag, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[11px] text-cream/60">
                            <span className="shrink-0 text-gold/70">{tag.icon}</span>
                            {tag.label}
                          </span>
                        ))}
                      </span>
                    )}
                    {opt.meta && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-cream/50">{opt.meta}</span>
                    )}
                  </span>
                  {isSelected && (
                    <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-gold">
                      <path d="M4 10.5L8 14.5L16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
