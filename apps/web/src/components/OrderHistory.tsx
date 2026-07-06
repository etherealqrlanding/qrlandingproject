import { eventDisplay, type EventTone, type OrderEvent } from '../lib/orderEvents';

interface HistoryItem { id: number; created_at: string; label: string; tone: EventTone }

// Línea de tiempo de los pasos de una orden (más antiguo → más reciente).
// Filtra eventos internos (webhooks, etc.) y muestra solo los hitos legibles.
const TONE_DOT: Record<string, string> = {
  good: 'bg-emerald-400',
  bad: 'bg-bordeaux-light',
  warn: 'bg-amber-400',
  neutral: 'bg-gold/60',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function OrderHistory({ events }: Readonly<{ events: OrderEvent[] }>) {
  // Orden cronológico (los endpoints los devuelven DESC → invertimos)
  const items = [...events]
    .reverse()
    .map((e): HistoryItem | null => {
      const d = eventDisplay(e.event_type);
      return d ? { id: e.id, created_at: e.created_at, label: d.label, tone: d.tone } : null;
    })
    .filter((x): x is HistoryItem => x !== null);

  if (items.length === 0) {
    return <p className="text-sm text-cream/40">Sin eventos registrados todavía.</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((it) => (
        <li key={it.id} className="flex gap-3">
          <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${TONE_DOT[it.tone] ?? TONE_DOT.neutral}`} />
          <div className="min-w-0">
            <p className="text-sm text-cream/90">{it.label}</p>
            <p className="text-xs text-cream/40">{fmt(it.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
