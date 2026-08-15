import { useMemo, useRef, useState } from 'react';
import { HOTELS_BY_NEIGHBORHOOD, ALL_HOTELS } from '../lib/hotels';
import Collapse from './Collapse';
import NumberStepper from './NumberStepper';

interface Props {
  qty: number;
  // Cantidad total de pasajeros (adultos + menores) — tope del selector: no puede
  // haber más pax con traslado que pax totales en la reserva.
  maxQty: number;
  hotel: string;
  room: string;
  onChange: (qty: number) => void;
  onHotelChange: (v: string) => void;
  onRoomChange: (v: string) => void;
  pickupWindow?: string | null;
  lang?: 'es' | 'en';
  // El traslado ya está incluido en el precio del servicio (sin costo extra): no se
  // pregunta cantidad, va para todos los pax — solo se pide el hotel/habitación para
  // coordinar el pickup.
  included?: boolean;
}

export default function TransferSection({
  qty, maxQty, hotel, room, onChange, onHotelChange, onRoomChange, pickupWindow, lang = 'es', included = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="rounded-lg border border-gold/15 bg-ink/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-cream/90">
            {included
              ? (isEs ? '✓ Tu traslado está incluido' : '✓ Your transfer is included')
              : (isEs ? '¿Cuántos van con traslado?' : 'How many need a transfer?')}
          </p>
          <p className="text-xs text-cream/50 mt-0.5">
            {included
              ? (isEs
                  ? 'Ya está incluido en el precio, sin costo adicional. Ida y vuelta desde tu hotel en el centro, Recoleta, Puerto Madero, San Telmo, Palermo o Retiro.'
                  : 'Already included in the price, at no extra cost. Round trip from your hotel in downtown, Recoleta, Puerto Madero, San Telmo, Palermo or Retiro.')
              : (isEs
                  ? 'Ida y vuelta desde tu hotel en el centro, Recoleta, Puerto Madero, San Telmo, Palermo o Retiro.'
                  : 'Round trip from your hotel in downtown, Recoleta, Puerto Madero, San Telmo, Palermo or Retiro.')}
          </p>
          {pickupWindow && (
            <p className="text-xs text-gold-soft mt-1">🚌 {pickupWindow}</p>
          )}
        </div>
        {!included && (
          <div className="shrink-0">
            <NumberStepper
              value={qty}
              min={0}
              max={maxQty}
              onChange={(v) => {
                onChange(v);
                if (v === 0) { onHotelChange(''); setQuery(''); }
              }}
              decrementLabel={isEs ? 'menos' : 'decrement'}
              incrementLabel={isEs ? 'más' : 'increment'}
            />
            <p className="mt-1 text-[11px] text-cream/40 text-right">
              {isEs ? `de ${maxQty} pasajero${maxQty !== 1 ? 's' : ''}` : `of ${maxQty} passenger${maxQty !== 1 ? 's' : ''}`}
            </p>
          </div>
        )}
      </div>

      {(included || qty > 0) && (
        <Collapse className="space-y-2">
          <p className="text-xs text-cream/60">
            {isEs
              ? 'Buscá tu hotel para que coordinemos el pickup:'
              : 'Search your hotel so we can coordinate pickup:'}
          </p>

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
              {open && (
                <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gold/20 bg-ink-soft shadow-xl">
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
                </div>
              )}
            </div>
          )}

          {!hotel && (
            <p className="text-xs text-cream/40">
              {isEs
                ? 'Si tu hotel no aparece, elegí el más cercano como punto de encuentro e informalo al confirmar.'
                : "If your hotel isn't listed, choose the nearest one as a meeting point and let us know when confirming."}
            </p>
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
        </Collapse>
      )}
    </div>
  );
}
