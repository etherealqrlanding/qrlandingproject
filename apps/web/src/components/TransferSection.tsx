import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HOTELS_BY_NEIGHBORHOOD, ALL_HOTELS, type TransferZone } from '../lib/hotels';
import Collapse from './Collapse';

interface Props {
  // Cantidad total de pasajeros (adultos + menores + infantes) — se usa para el
  // copy ("se cotiza para los N pasajeros"). Los infantes también ocupan lugar
  // en el vehículo aunque se facturen aparte.
  totalPax: number;
  hotel: string;
  room: string;
  onHotelChange: (v: string) => void;
  onRoomChange: (v: string) => void;
  pickupWindow?: string | null;
  lang?: 'es' | 'en';
  // El traslado ya está incluido en el precio del servicio (sin costo extra, sin
  // pregunta): va para todos los pax. Si es false, el traslado tiene costo aparte
  // y el cliente decide con el toggle Sí/No (ver `wanted`) si lo suma o no — todo
  // o nada, nunca una cantidad parcial de pasajeros.
  included?: boolean;
  // Solo relevante cuando included=false.
  wanted?: boolean;
  onWantedChange?: (v: boolean) => void;
  // Precio por pasajero a mostrar junto al toggle (solo cuando included=false).
  // Ya resuelto para la zona del hotel elegido (o la base, si todavía no eligió).
  pricePerPax?: number;
  // Si la casa distingue precio de traslado por zona (Palermo vs. el resto) y cuál
  // le tocó al hotel ya elegido -- para avisar explícitamente que se aplicó la
  // tarifa de Palermo y evitar sorpresas/errores de cobro.
  hasZonePricing?: boolean;
  zone?: TransferZone;
}

export default function TransferSection({
  totalPax, hotel, room, onHotelChange, onRoomChange, pickupWindow, lang = 'es',
  included = false, wanted = false, onWantedChange, pricePerPax, hasZonePricing = false, zone,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // El dropdown se porta a document.body (position: fixed) porque vive dentro de un
  // <Collapse>, que necesita overflow-hidden para animar su alto -- eso recortaría
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
  // Antes, "incluido" no dejaba elegir (forzaba a buscar hotel siempre). Ahora el
  // Sí/No se muestra en los dos casos -- para "incluido" no cambia el precio (ya
  // está pagado), pero el pasajero puede no usarlo si no lo necesita, sin tener
  // que cargar un hotel igual.
  const showDetails = wanted;

  return (
    <div className="rounded-lg border border-gold/15 bg-ink/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-cream/90">
            {included
              ? (wanted
                  ? (isEs ? '✓ Tu traslado está incluido' : '✓ Your transfer is included')
                  : (isEs ? '🚐 Traslado incluido disponible' : '🚐 Included transfer available'))
              : (isEs ? '🚐 ¿Querés agregar traslado?' : '🚐 Want to add transfer?')}
          </p>
          <p className="text-xs text-cream/50 mt-0.5">
            {included
              ? (isEs
                  ? 'Ya está incluido en el precio, sin costo adicional. Ida y vuelta desde tu hotel en el centro, Recoleta, Puerto Madero, San Telmo, Palermo o Retiro. Si no lo necesitás, podés no usarlo.'
                  : 'Already included in the price, at no extra cost. Round trip from your hotel in downtown, Recoleta, Puerto Madero, San Telmo, Palermo or Retiro. If you don\'t need it, you can skip it.')
              : (isEs
                  ? `Ida y vuelta desde tu hotel en el centro, Recoleta, Puerto Madero, San Telmo, Palermo o Retiro${pricePerPax != null ? ` — USD ${pricePerPax}/pax` : ''}. Se cotiza para los ${totalPax} pasajero${totalPax !== 1 ? 's' : ''} de la reserva (incluye infantes).`
                  : `Round trip from your hotel in downtown, Recoleta, Puerto Madero, San Telmo, Palermo or Retiro${pricePerPax != null ? ` — USD ${pricePerPax}/pax` : ''}. Priced for all ${totalPax} passenger${totalPax !== 1 ? 's' : ''} in the booking (infants included).`)}
          </p>
          <p className={`mt-1 text-[11px] ${wanted ? 'text-emerald-400' : 'text-cream/40'}`}>
            {wanted
              ? (included
                  ? (isEs ? '✓ Vas a usar el traslado incluido' : '✓ You\'ll use the included transfer')
                  : (isEs ? '✓ Traslado agregado para todo el grupo' : '✓ Transfer added for the whole group'))
              : (isEs ? 'Sin traslado' : 'No transfer')}
          </p>
          {pickupWindow && (
            <p className="text-xs text-gold-soft mt-1">🚌 {pickupWindow}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => onWantedChange?.(true)}
            aria-pressed={wanted}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              wanted ? 'bg-gold text-ink' : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'
            }`}
          >
            {isEs ? 'Sí' : 'Yes'}
          </button>
          <button
            type="button"
            onClick={() => onWantedChange?.(false)}
            aria-pressed={!wanted}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              !wanted ? 'bg-gold text-ink' : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'
            }`}
          >
            {isEs ? 'No' : 'No'}
          </button>
        </div>
      </div>

      {showDetails && (
        <Collapse className="space-y-2">
          <p className="text-xs text-cream/60">
            {isEs
              ? 'Buscá tu hotel para que coordinemos el pickup:'
              : 'Search your hotel so we can coordinate pickup:'}
          </p>

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
          ) : null}

          {!included && hotel && hasZonePricing && zone === 'palermo' && (
            <div className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 flex items-start gap-2">
              <span aria-hidden className="shrink-0">📍</span>
              <p className="text-xs text-cream/80">
                {isEs ? (
                  <>Tu hotel está en <strong className="text-gold">Palermo</strong> — se aplica la tarifa de traslado de esa zona{pricePerPax != null ? ` (USD ${pricePerPax}/pax)` : ''}, distinta de la de zona céntrica.</>
                ) : (
                  <>Your hotel is in <strong className="text-gold">Palermo</strong> — the transfer rate for that zone applies{pricePerPax != null ? ` (USD ${pricePerPax}/pax)` : ''}, different from the downtown zone.</>
                )}
              </p>
            </div>
          )}

          {!hotel && (
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
        </Collapse>
      )}
    </div>
  );
}
