import { eventDisplay, type EventTone, type OrderEvent } from '../lib/orderEvents';

interface HistoryItem { id: number; created_at: string; label: string; tone: EventTone; detail: string | null }

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

function fmtArs(n: unknown): string {
  return `ARS ${Math.round(Number(n)).toLocaleString('es-AR')}`;
}

function paxLabel(adults: unknown, children: unknown): string {
  const parts = [`${Number(adults)} ad`];
  if (Number(children) > 0) parts.push(`${Number(children)} men`);
  return parts.join(' · ');
}

// Genera una línea de detalle legible a partir del payload del evento.
// Devuelve null si no hay información útil para mostrar.
function eventDetail(type: string, payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;

  if (type === 'order_modified') {
    const comp = paxLabel(payload.new_adults, payload.new_children);
    const xfer = payload.new_transfer === false ? ' · sin traslado' : '';
    const refund = payload.refund_ars != null ? ` — devuelto ${fmtArs(payload.refund_ars)}` : '';
    const actor = payload.actor === 'admin' ? ' (por admin)' : payload.actor === 'seller' ? ' (por vendedor)' : '';
    return `${comp}${xfer}${refund}${actor}`;
  }

  if (type === 'addon_cash_created') {
    const a = Number(payload.extra_adults ?? 0);
    const c = Number(payload.extra_children ?? 0);
    const parts: string[] = [];
    if (a > 0) parts.push(`+${a} ad`);
    if (c > 0) parts.push(`+${c} men`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  if (type === 'addon_cash_collected' || type === 'addon_paid' || type === 'order_increased_cash') {
    const parts: string[] = [];
    const a = Number(payload.extra_adults ?? payload.new_adults ?? 0);
    const c = Number(payload.extra_children ?? payload.new_children ?? 0);
    if (a > 0) parts.push(`+${a} ad`);
    if (c > 0) parts.push(`+${c} men`);
    if (payload.charge_ars != null) parts.push(`cobrado ${fmtArs(payload.charge_ars)}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  return null;
}

export default function OrderHistory({ events }: Readonly<{ events: OrderEvent[] }>) {
  const items = [...events]
    .reverse()
    .map((e): HistoryItem | null => {
      const d = eventDisplay(e.event_type);
      return d ? {
        id: e.id,
        created_at: e.created_at,
        label: d.label,
        tone: d.tone,
        detail: eventDetail(e.event_type, e.payload),
      } : null;
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
            {it.detail && <p className="text-xs text-cream/60 mt-0.5">{it.detail}</p>}
            <p className="text-xs text-cream/40">{fmt(it.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
