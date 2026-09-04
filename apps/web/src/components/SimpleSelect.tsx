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
  // 'sm' = versión compacta para convivir en una fila junto a un input de PIN y
  // botones chicos (gates de identificación); 'md' (default) = tamaño estándar de
  // filtro, igual que siempre.
  size?: 'sm' | 'md';
  // Borde en rojo/bordeaux para reflejar un campo obligatorio sin completar --
  // mismo criterio visual que los <input> de validación del resto de los forms.
  error?: boolean;
  // Para scrollIntoView + foco al saltar a un campo con error de validación (ver
  // scrollToField en BookingForm/CheckoutForm) -- va en el wrapper, no en el botón.
  id?: string;
}

/**
 * Reemplazo liviano de un <select> nativo (Headless UI Listbox) — el nativo no se
 * puede restylear, el panel desplegado sale blanco del SO y rompe con la paleta
 * oscura/dorada del resto de los filtros. Mismo look que los otros controles de
 * filtro (SellerFilterSelect, DateRangePicker): trigger con clase `.input`.
 */
export default function SimpleSelect({ value, onChange, options, className, disabled, size = 'md', error = false, id }: Props) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  const isSm = size === 'sm';

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div id={id} className={`relative ${className ?? ''}`}>
        <ListboxButton
          className={
            isSm
              ? `w-full flex items-center justify-between gap-1.5 rounded-md border bg-ink/60 px-2 py-1.5 text-xs text-cream text-left focus:outline-none transition ${error ? 'border-bordeaux-light/60' : 'border-gold/20 focus:border-gold/40'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
              : `input flex items-center justify-between gap-2 text-left text-sm ${error ? 'border-bordeaux-light/60' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
          }
        >
          {({ open }) => (
            <>
              <span className="truncate">{selected?.label}</span>
              <svg aria-hidden viewBox="0 0 20 20" fill="none"
                className={`${isSm ? 'h-3 w-3' : 'h-4 w-4'} shrink-0 text-gold/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </ListboxButton>

        <ListboxOptions
          transition
          anchor="bottom start"
          className={`z-50 w-[var(--button-width)] mt-2 overflow-auto rounded-lg border border-gold/25 bg-ink-soft shadow-2xl shadow-black/50 focus:outline-none transition duration-150 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1 ${isSm ? 'max-h-56 py-1' : 'max-h-72 py-1.5'}`}
        >
          {options.map((o) => (
            <ListboxOption
              key={o.value}
              value={o.value}
              className={`cursor-pointer select-none flex items-center justify-between gap-3 text-cream/90 data-[focus]:bg-gold/10 data-[selected]:text-gold ${isSm ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}
            >
              {({ selected: isSelected }) => (
                <>
                  <span className="truncate">{o.label}</span>
                  {isSelected && (
                    <svg aria-hidden viewBox="0 0 20 20" fill="none" className={`${isSm ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0 text-gold`}>
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
