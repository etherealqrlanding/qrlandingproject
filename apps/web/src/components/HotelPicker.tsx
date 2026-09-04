import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HOTELS_BY_NEIGHBORHOOD, ALL_HOTELS } from '../lib/hotels';

interface Props {
  hotel: string;
  room: string;
  onHotelChange: (v: string) => void;
  onRoomChange: (v: string) => void;
  lang?: 'es' | 'en';
}

// Buscador de hotel + habitación, con la lista de hoteles habilitados para pickup.
// Extraído de TransferSection para poder reusarlo también al EDITAR el hotel de un
// traslado que ya está activo (no solo al activarlo por primera vez).
export default function HotelPicker({ hotel, room, onHotelChange, onRoomChange, lang = 'es' }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // El dropdown se porta a document.body (position: fixed) porque a veces vive dentro
  // de un <Collapse>, que necesita overflow-hidden para animar su alto -- eso recortaría
  // cualquier menú posicionado absoluto que se salga de esa caja.
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropdownRect({ top: r.bottom, left: r.left, width: r.width });
    };
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return HOTELS_BY_NEIGHBORHOOD;
    const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return HOTELS_BY_NEIGHBORHOOD.map((n) => ({
      ...n,
      hotels: n.hotels.filter((h) => {
        const name = h.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const addr = h.address.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        return name.includes(q) || addr.includes(q) || n.label.toLowerCase().includes(q);
      }),
    })).filter((n) => n.hotels.length > 0);
  }, [query]);

  const allFiltered = useMemo(
    () => ALL_HOTELS.filter((h) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return (
        h.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q) ||
        h.address.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q) ||
        h.neighborhood.toLowerCase().includes(q)
      );
    }),
    [query],
  );

  const selectHotel = (name: string, address: string) => {
    onHotelChange(`${name} – ${address}`);
    setQuery('');
    setOpen(false);
  };

  const isEs = lang === 'es';

  return (
    <div className="space-y-2">
      {!hotel && (
        <div className="rounded-md border border-gold/20 bg-ink/40 px-3 py-2 flex items-start gap-2">
          <span aria-hidden className="shrink-0">ℹ️</span>
          <p className="text-xs text-cream/70">
            {isEs
              ? 'El traslado pasa a buscar únicamente por los hoteles de este listado. Si no estás hospedado en ninguno de ellos, acercate al más cercano y usalo como punto de encuentro.'
              : 'The transfer only picks up at the hotels on this list. If you\'re not staying at one of them, walk to the nearest one and use it as your meeting point.'}
          </p>
        </div>
      )}

      {hotel ? (
        <div className="flex items-center justify-between rounded-md border border-gold/30 bg-gold/5 px-3 py-2">
          <div>
            <p className="text-sm text-cream">{hotel.split(' – ')[0]}</p>
            <p className="text-xs text-cream/50">{hotel.split(' – ').slice(1).join(' – ')}</p>
          </div>
          <button
            type="button"
            onClick={() => { onHotelChange(''); setQuery(''); inputRef.current?.focus(); }}
            className="text-xs text-cream/40 hover:text-cream ml-3"
          >
            {isEs ? 'Cambiar' : 'Change'}
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={isEs ? 'Nombre del hotel o barrio...' : 'Hotel name or neighborhood...'}
            className="input w-full text-sm"
            autoComplete="off"
          />
          {open && dropdownRect && createPortal(
            <div
              style={{ position: 'fixed', top: dropdownRect.top + 4, left: dropdownRect.left, width: dropdownRect.width }}
              className="z-50 max-h-64 overflow-y-auto rounded-lg border border-gold/20 bg-ink-soft shadow-xl"
            >
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-cream/50">
                    {isEs
                      ? 'No encontramos ese hotel. Elegí el más cercano como punto de encuentro.'
                      : 'Hotel not found. Choose the nearest one as a meeting point.'}
                  </p>
                </div>
              ) : (
                filtered.map((n) => (
                  <div key={n.label}>
                    <p className="sticky top-0 px-3 py-1.5 text-xs uppercase tracking-widest text-gold-soft bg-ink-soft/95 border-b border-gold/10">
                      {n.label}
                    </p>
                    {n.hotels.map((h) => (
                      <button
                        key={h.name}
                        type="button"
                        onMouseDown={() => selectHotel(h.name, h.address)}
                        className="w-full text-left px-4 py-2 hover:bg-gold/10 transition"
                      >
                        <span className="text-sm text-cream block">{h.name}</span>
                        <span className="text-xs text-cream/45">{h.address}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
              {allFiltered.length > 0 && query && (
                <p className="px-4 py-2 text-xs text-cream/30 border-t border-gold/10">
                  {allFiltered.length} resultado{allFiltered.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>,
            document.body,
          )}
        </div>
      )}

      <label className="block">
        <span className="block text-xs text-cream/60 mb-1">
          {isEs ? 'Número de habitación' : 'Room number'}
        </span>
        <input
          type="text"
          value={room}
          onChange={(e) => onRoomChange(e.target.value)}
          maxLength={80}
          placeholder={isEs ? 'Ej: 305, Suite 12...' : 'e.g. 305, Suite 12...'}
          className="input w-full text-sm"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-cream/40">
          {isEs
            ? 'Lo usamos para que el transporte te avise cuando esté llegando.'
            : 'We use this to let the driver notify you on arrival.'}
        </p>
      </label>
    </div>
  );
}
