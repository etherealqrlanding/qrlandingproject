import { useEffect, useMemo, useState } from 'react';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { adminApi, type AdminSeller } from '../../lib/adminApi';

interface Props {
  value: string; // código del vendedor, '' = todos
  onChange: (code: string) => void;
  className?: string;
}

/**
 * Desplegable con búsqueda de vendedores (Headless UI Combobox) para filtrar
 * órdenes por código exacto — reemplaza el input de texto libre, que obligaba
 * a tipear el código a mano y sin poder verificar que existiera. Se banca
 * códigos de vendedores ya borrados (que igual pueden aparecer en órdenes
 * viejas) dejando pasar el texto tipeado como opción si no matchea ninguno.
 */
export default function SellerFilterSelect({ value, onChange, className }: Props) {
  const [sellers, setSellers] = useState<AdminSeller[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    adminApi.sellers.list().then(setSellers).catch(() => setSellers([]));
  }, []);

  const selected = useMemo(
    () => sellers?.find((s) => s.code === value) ?? null,
    [sellers, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? (sellers ?? [])
      : (sellers ?? []).filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    // Activos primero — son los que se van a filtrar casi siempre; los inactivos
    // quedan más abajo pero visibles (una orden vieja puede seguir referenciándolos).
    return [...list].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
  }, [sellers, query]);

  // Si el admin tipeó un código que no está en la lista (vendedor borrado, por
  // ejemplo) igual lo dejamos aplicar como filtro exacto.
  const exactUnknown = query.trim() && !sellers?.some((s) => s.code.toLowerCase() === query.trim().toLowerCase())
    ? query.trim()
    : null;

  return (
    <Combobox
      value={value}
      onChange={(v) => { if (v != null) onChange(v); }}
      onClose={() => setQuery('')}
    >
      <div className={`relative ${className ?? ''}`}>
        <div className="relative">
          <ComboboxInput
            className="input font-mono text-sm pr-8"
            placeholder="Todos los vendedores"
            displayValue={() => (selected ? `${selected.code} — ${selected.name}` : value ? value : '')}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-cream/40 hover:text-cream/70">
            <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ComboboxButton>
        </div>

        <ComboboxOptions
          transition
          anchor="bottom start"
          className="z-50 w-[var(--input-width)] mt-2 max-h-80 overflow-auto rounded-lg border border-gold/25 bg-ink-soft py-1.5 shadow-2xl shadow-black/50 focus:outline-none transition duration-150 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1 empty:invisible"
        >
          <ComboboxOption
            value=""
            className="cursor-pointer select-none px-4 py-2 text-sm text-cream/70 data-[focus]:bg-gold/10 data-[selected]:text-gold"
          >
            Todos los vendedores
          </ComboboxOption>
          {filtered.map((s) => (
            <ComboboxOption
              key={s.code}
              value={s.code}
              className={`cursor-pointer select-none px-4 py-2 flex items-center gap-2.5 text-sm data-[focus]:bg-gold/10 data-[selected]:text-gold ${
                s.is_active ? 'text-cream/90' : 'text-cream/40'
              }`}
            >
              <span
                title={s.is_active ? 'Activo' : 'Inactivo'}
                className={`shrink-0 h-1.5 w-1.5 rounded-full ${s.is_active ? 'bg-emerald-400' : 'bg-cream/20'}`}
              />
              <span className="min-w-0 flex-1 truncate">
                {s.name}
                {!s.is_active && <span className="ml-1.5 text-[10px] text-cream/30">(inactivo)</span>}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-gold-soft/80">{s.code}</span>
            </ComboboxOption>
          ))}
          {exactUnknown && (
            <ComboboxOption
              value={exactUnknown}
              className="cursor-pointer select-none px-4 py-2 text-sm text-cream/60 italic data-[focus]:bg-gold/10 data-[selected]:text-gold border-t border-gold/10 mt-1 pt-2"
            >
              Usar código exacto: <span className="font-mono not-italic">{exactUnknown}</span>
            </ComboboxOption>
          )}
          {sellers && filtered.length === 0 && !exactUnknown && (
            <p className="px-4 py-2 text-xs text-cream/30">Sin resultados.</p>
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}
