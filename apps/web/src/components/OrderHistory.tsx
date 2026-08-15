import { eventDisplay, type EventTone, type OrderEvent } from '../lib/orderEvents';

interface HistoryItem {
  id: number;
  created_at: string;
  label: string;
  tone: EventTone;
  detail: string | null;
  highlight: boolean;
}

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

function fmtShortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${String(y).slice(2)}`;
}

function fmtArs(n: unknown): string {
  return `ARS ${Math.round(Number(n)).toLocaleString('es-AR')}`;
}

function paxLabel(adults: unknown, children: unknown): string {
  const parts = [`${Number(adults)} ad`];
  if (Number(children) > 0) parts.push(`${Number(children)} men`);
  return parts.join(' · ');
}

// Extrae un string seguro de un valor desconocido del payload
function strVal(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

// Quién hizo el movimiento: prioriza el nombre puntual del sub-vendedor
// (guardado en el evento cuando se identificó con su propio PIN) — solo cuando
// no hay nombre (autorizado con el PIN de administrador, que no es de una
// persona en particular) cae al rol genérico.
function actorLabel(payload: Record<string, unknown>): string | null {
  const name = strVal(payload.seller_member_name);
  if (name) return name;
  if (payload.actor === 'admin') return 'administrador';
  if (payload.actor === 'seller') return 'recomendador';
  return null;
}

// Sufijo de actor para eventos de modificación
function actorSuffix(payload: Record<string, unknown>): string {
  const label = actorLabel(payload);
  return label ? ` (${label})` : '';
}

// Prefijo de actor para eventos de cancelación
function actorPrefix(payload: Record<string, unknown>): string {
  const label = actorLabel(payload);
  return label ? `Por ${label}` : '';
}

function detailRescheduled(payload: Record<string, unknown>): string {
  const prevRaw = strVal(payload.prev_date);
  const nextRaw = strVal(payload.new_date);
  const prev = prevRaw ? fmtShortDate(prevRaw) : '?';
  const next = nextRaw ? fmtShortDate(nextRaw) : '?';
  const actor = actorSuffix(payload);
  const rawReason = strVal(payload.reason);
  const reason = rawReason ? ` · "${rawReason}"` : '';
  return `${prev} → ${next}${actor}${reason}`;
}

function detailModified(payload: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (payload.new_adults != null) parts.push(paxLabel(payload.new_adults, payload.new_children));
  if (payload.new_transfer_qty === 0) parts.push('sin traslado');
  if (payload.refund_ars != null) parts.push(`devuelto ${fmtArs(payload.refund_ars)}`);
  const actor = actorSuffix(payload);
  if (parts.length > 0) return `${parts.join(' · ')}${actor}`;
  return actor.trim() || null;
}

function detailCancelled(payload: Record<string, unknown>): string | null {
  const actor = actorPrefix(payload);
  const rawReason = strVal(payload.reason);
  const reason = rawReason ? `"${rawReason}"` : '';
  const parts = [actor, reason].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function detailRefund(payload: Record<string, unknown>, partial: boolean): string | null {
  const parts: string[] = [];
  const prefix = partial ? 'Parcial ' : '';
  if (payload.amount_ars != null) {
    parts.push(`${prefix}${fmtArs(payload.amount_ars)}`);
  } else if (payload.amount_usd != null) {
    parts.push(`${prefix}USD ${Number(payload.amount_usd).toFixed(2)}`);
  }
  const rawReason = strVal(payload.reason);
  if (rawReason) parts.push(`"${rawReason}"`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function detailAddonCreated(payload: Record<string, unknown>): string | null {
  const a = Number(payload.extra_adults ?? 0);
  const c = Number(payload.extra_children ?? 0);
  const parts: string[] = [];
  if (a > 0) parts.push(`+${a} ad`);
  if (c > 0) parts.push(`+${c} men`);
  const actor = actorSuffix(payload);
  if (parts.length > 0) return `${parts.join(' · ')}${actor}`;
  return actor.trim() || null;
}

function detailAttributionSetByAdmin(payload: Record<string, unknown>): string | null {
  const name = strVal(payload.seller_member_name);
  return name ? `Asignada a ${name}` : 'Atribución removida';
}

function detailCreatedByAdmin(payload: Record<string, unknown>): string | null {
  const adminEmail = strVal(payload.admin_email);
  const sellerName = strVal(payload.seller_name);
  const sellerCode = strVal(payload.seller_code);
  const parts: string[] = [];
  if (adminEmail) parts.push(`por ${adminEmail}`);
  if (sellerName) parts.push(`a nombre de ${sellerName}${sellerCode ? ` (${sellerCode})` : ''}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function detailAddonCollected(payload: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const a = Number(payload.extra_adults ?? payload.new_adults ?? 0);
  const c = Number(payload.extra_children ?? payload.new_children ?? 0);
  if (a > 0) parts.push(`+${a} ad`);
  if (c > 0) parts.push(`+${c} men`);
  if (payload.charge_ars != null) parts.push(`cobrado ${fmtArs(payload.charge_ars)}`);
  const actor = actorSuffix(payload);
  if (parts.length > 0) return `${parts.join(' · ')}${actor}`;
  return actor.trim() || null;
}

function detailCashCollected(payload: Record<string, unknown>): string | null {
  const currency = strVal(payload.currency);
  const actor = actorSuffix(payload);
  const parts: string[] = [];
  if (currency) parts.push(`en ${currency}`);
  if (parts.length > 0) return `${parts.join(' · ')}${actor}`;
  return actor.trim() || null;
}

function detailAttributionSetByMember(payload: Record<string, unknown>): string | null {
  const name = strVal(payload.seller_member_name);
  return name ? `Autoasignada por ${name}` : null;
}

function eventDetail(type: string, payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  if (type === 'order_rescheduled') return detailRescheduled(payload);
  if (type === 'order_modified') return detailModified(payload);
  if (type === 'order_cancelled') return detailCancelled(payload);
  if (type === 'refund_processed') return detailRefund(payload, false);
  if (type === 'refund_partial_processed') return detailRefund(payload, true);
  if (type === 'addon_cash_created') return detailAddonCreated(payload);
  if (type === 'cash_order_created_by_admin' || type === 'preference_created_by_admin') return detailCreatedByAdmin(payload);
  if (type === 'attribution_set_by_admin') return detailAttributionSetByAdmin(payload);
  if (type === 'attribution_set_by_member') return detailAttributionSetByMember(payload);
  if (type === 'cash_collected_by_seller' || type === 'cash_collected_by_admin') return detailCashCollected(payload);
  if (type === 'addon_cash_collected' || type === 'addon_paid' || type === 'order_increased_cash') {
    return detailAddonCollected(payload);
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
        highlight: e.event_type === 'order_rescheduled',
      } : null;
    })
    .filter((x): x is HistoryItem => x !== null);

  if (items.length === 0) {
    return <p className="text-sm text-cream/40">Sin eventos registrados todavía.</p>;
  }

  return (
    <ol className="space-y-2">
      {items.map((it) => (
        <li
          key={it.id}
          className={it.highlight ? 'flex gap-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2.5 -mx-3' : 'flex gap-3'}
        >
          <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${TONE_DOT[it.tone] ?? TONE_DOT.neutral}`} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm ${it.highlight ? 'text-amber-300 font-medium' : 'text-cream/90'}`}>
              {it.label}
            </p>
            {it.detail && (
              <p className={`text-xs mt-0.5 ${it.highlight ? 'text-amber-400/80' : 'text-cream/60'}`}>
                {it.detail}
              </p>
            )}
            <p className="text-xs text-cream/35 mt-0.5">{fmt(it.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
