import { type TransferZone } from '../lib/hotels';
import Collapse from './Collapse';
import HotelPicker from './HotelPicker';

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

          <HotelPicker hotel={hotel} room={room} onHotelChange={onHotelChange} onRoomChange={onRoomChange} lang={lang} />
        </Collapse>
      )}
    </div>
  );
}
