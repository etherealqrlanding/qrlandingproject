import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';

export interface SimpleSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SimpleSelectOption[];
  className?: string;
  disabled?: boolean;
}

/**
 * Reemplazo liviano de un <select> nativo (Headless UI Listbox) — el nativo no se
 * puede restylear, el panel desplegado sale blanco del SO y rompe con la paleta
 * oscura/dorada del resto de los filtros. Mismo look que los otros controles de
 * filtro (SellerFilterSelect, DateRangePicker): trigger con clase `.input`.
 */
export default function SimpleSelect({ value, onChange, options, className, disabled }: Props) {
  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className ?? ''}`}>
        <ListboxButton
          className={`input flex items-center justify-between gap-2 text-left text-sm ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {({ open }) => (
            <>
              <span className="truncate">{selected?.label}</span>
              <svg aria-hidden viewBox="0 0 20 20" fill="none"
                className={`h-4 w-4 shrink-0 text-gold/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </ListboxButton>

        <ListboxOptions
          transition
          anchor="bottom start"
          className="z-50 w-[var(--button-width)] mt-2 max-h-72 overflow-auto rounded-lg border border-gold/25 bg-ink-soft py-1.5 shadow-2xl shadow-black/50 focus:outline-none transition duration-150 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1"
        >
          {options.map((o) => (
            <ListboxOption
              key={o.value}
              value={o.value}
              className="cursor-pointer select-none px-4 py-2 flex items-center justify-between gap-3 text-sm text-cream/90 data-[focus]:bg-gold/10 data-[selected]:text-gold"
            >
              {({ selected: isSelected }) => (
                <>
                  <span className="truncate">{o.label}</span>
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
