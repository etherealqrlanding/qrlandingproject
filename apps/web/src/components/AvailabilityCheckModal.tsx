import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type AvailabilityDay } from '../lib/api';
import AvailabilityCalendar from './AvailabilityCalendar';
import type { ProductDetail, ProductOption } from '../types/api';

interface Props {
  productSlug: string;
  productName: string;
  onClose: () => void;
  // Arranca en este tier en vez del primero de la casa — para cuando el botón que abrió
  // el modal ya estaba asociado a un servicio puntual (ej. la card de ese tier).
  initialOptionId?: number;
  // Se dispara al tocar "Reservar esta fecha": el consumidor abre el flujo de reserva
  // correspondiente (checkout público o modal del vendedor) con la casa, el servicio, la
  // fecha y (si se marcaron) los pasajeros ya cargados.
  onBookDate: (product: ProductDetail, option: ProductOption, date: string, pax?: { adults: number; children: number }) => void;
}

function formatDayLabel(iso: string): string {
  const raw = new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function statusFeedback(day: AvailabilityDay | undefined, pax: number): { text: string; tone: 'ok' | 'warn' | 'bad' } | null {
  if (!day) return null;
  switch (day.status) {
    case 'available':
      return { text: pax > 1 ? `✓ Entran ${pax} pasajeros` : '✓ Disponible', tone: 'ok' };
    case 'low':
      return {
        text: day.remaining != null
          ? `⚡ Quedan ${day.remaining} lugar${day.remaining !== 1 ? 'es' : ''}`
          : pax > 1 ? `⚡ Entran los ${pax} pasajeros, pero quedan pocos lugares` : '⚡ Quedan pocos lugares',
        tone: 'warn',
      };
    case 'full':
      return { text: pax > 1 ? `✕ No entran ${pax} pasajeros en esta fecha` : '✕ Sin cupo para esta fecha', tone: 'bad' };
    case 'closed':
      if (day.reason === 'cutoff') return { text: '⚠ El horario límite de reservas de hoy ya pasó', tone: 'bad' };
      if (day.reason === 'not_operating_day') return { text: '⚠ El servicio no opera ese día de la semana', tone: 'bad' };
      if (day.reason === 'beyond_horizon') return { text: '⚠ Fuera del horizonte de venta habilitado', tone: 'bad' };
      return { text: '⚠ La casa no opera esa fecha', tone: 'bad' };
    default:
      return null;
  }
}

const TONE_CLASS: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'text-emerald-400',
  warn: 'text-gold-soft',
  bad: 'text-bordeaux-light',
};

function MiniStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex-1">
      <label className="block text-[10px] uppercase tracking-wider text-cream/35 mb-1">{label}</label>
      <div className="flex items-center rounded-md border border-gold/20 bg-ink/40 overflow-hidden">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))}
          className="px-3 py-1.5 text-cream hover:bg-gold/10 transition" aria-label={`Restar ${label.toLowerCase()}`}>−</button>
        <span className="flex-1 text-center text-sm text-cream tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(20, value + 1))}
          className="px-3 py-1.5 text-cream hover:bg-gold/10 transition" aria-label={`Sumar ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

// Modal de "Verificar disponibilidad" — se elige un servicio (tier) de la casa, se ve el
// semáforo de cupo por fecha (mismo calendario/endpoint que el checkout público, el
// portal del vendedor y Configuración) y el detalle en texto del día que se está mirando,
// con nombre de día incluido para calcular mejor. Desde ahí se puede pasar directo a
// reservar esa fecha. Lo usan tanto el portal del vendedor (SellerCatalog/SellerBooking)
// como el sitio público (ProductPage) — sin ninguna dependencia de auth de ninguno de los dos.
export default function AvailabilityCheckModal({ productSlug, productName, onClose, initialOptionId, onBookDate }: Props) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optionId, setOptionId] = useState<number | null>(null);
  const [dayInfo, setDayInfo] = useState<AvailabilityDay | undefined>(undefined);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [viewDate, setViewDate] = useState(today);
  // Adultos + menores comparten un único pool de cupo (ver settings.ts) — filtrar por la
  // suma es exactamente lo mismo que ya usa el checkout. 0/0 = sin filtrar (comportamiento
  // de antes: cualquier lugar libre alcanza).
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const pax = adults + children;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    api.products.bySlug(productSlug)
      .then((d) => {
        setDetail(d);
        const initial = initialOptionId != null && d.options.some((o) => o.id === initialOptionId)
          ? initialOptionId : d.options[0]?.id ?? null;
        setOptionId(initial);
      })
      .catch(() => setError('No se pudo cargar la disponibilidad de esta casa.'))
      .finally(() => setLoading(false));
  // Solo al montar (con el slug ya fijo) — no queremos que cambie el tier elegido si
  // initialOptionId cambiara de identidad por algún motivo externo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSlug]);

  // Estable entre renders — evita que AvailabilityCalendar dispare el efecto de más.
  const handleDayInfo = useCallback((day: AvailabilityDay | undefined) => setDayInfo(day), []);

  const selectedOption = detail?.options.find((o) => o.id === optionId) ?? null;
  const feedback = statusFeedback(dayInfo, pax);
  const canBook = dayInfo?.status === 'available' || dayInfo?.status === 'low';

  const handleBook = () => {
    if (!detail || !selectedOption || !canBook) return;
    onBookDate(detail, selectedOption, viewDate, pax > 0 ? { adults, children } : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="relative w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 animate-modal-panel">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
          >
            ×
          </button>

          <div className="p-5 border-b border-gold/10">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Verificar disponibilidad</p>
            <h2 className="mt-1.5 font-display text-2xl text-cream pr-8">{productName}</h2>
          </div>

          <div className="p-5 space-y-3">
            {loading && (
              <div className="space-y-3">
                <div className="h-10 rounded-lg bg-ink/40 animate-pulse" />
                <div className="h-72 rounded-lg bg-ink/40 animate-pulse" />
              </div>
            )}

            {!loading && error && <p className="text-sm text-bordeaux-light">{error}</p>}

            {!loading && detail && detail.options.length === 0 && (
              <p className="text-sm text-cream/40">Esta casa todavía no tiene servicios cargados.</p>
            )}

            {!loading && detail && detail.options.length > 0 && (
              <>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-cream/35 mb-1.5">
                    Filtrar por servicio
                  </label>
                  <select
                    value={optionId ?? ''}
                    onChange={(e) => { setOptionId(Number(e.target.value)); setDayInfo(undefined); }}
                    className="w-full rounded-lg border border-gold/20 bg-ink/40 px-3 py-2.5 text-sm text-cream focus:outline-none focus:border-gold/50"
                  >
                    {detail.options.map((o) => (
                      <option key={o.id} value={o.id}>{o.name_es}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-cream/35 mb-1.5">
                    Cantidad de pasajeros <span className="normal-case text-cream/25">(opcional)</span>
                  </label>
                  <div className="flex gap-3">
                    <MiniStepper label="Adultos" value={adults} onChange={setAdults} />
                    {detail.accepts_children && (
                      <MiniStepper
                        label={detail.children_age_label ? `Menores (${detail.children_age_label})` : 'Menores'}
                        value={children}
                        onChange={setChildren}
                      />
                    )}
                  </div>
                  {!detail.accepts_children && (
                    <p className="mt-1.5 text-[11px] text-cream/30">Esta casa no acepta menores.</p>
                  )}
                </div>

                {optionId != null && (
                  <AvailabilityCalendar
                    optionId={optionId}
                    value={viewDate}
                    currentDate={today}
                    onChange={setViewDate}
                    onDayInfo={handleDayInfo}
                    pax={pax > 0 ? pax : undefined}
                    compact
                  />
                )}

                {/* Feedback en texto del día que se está mirando — con nombre de día para
                    calcular mejor antes de confirmar. */}
                {optionId != null && (
                  <div className="rounded-lg border border-gold/15 bg-ink/30 p-3">
                    <p className="text-sm font-medium text-cream">{formatDayLabel(viewDate)}</p>
                    {feedback ? (
                      <p className={`mt-1 text-sm ${TONE_CLASS[feedback.tone]}`}>{feedback.text}</p>
                    ) : (
                      <p className="mt-1 text-xs text-cream/40">Verificando disponibilidad...</p>
                    )}
                  </div>
                )}

                {optionId != null && (
                  <button
                    type="button"
                    onClick={handleBook}
                    disabled={!canBook}
                    className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gold"
                  >
                    {canBook ? 'Reservar esta fecha →' : 'Elegí una fecha disponible'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
