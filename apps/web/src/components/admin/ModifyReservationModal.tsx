import { useMemo, useState } from 'react';
import AvailabilityCalendar from '../AvailabilityCalendar';
import Checkbox from '../Checkbox';
import type { SellerMember } from '../../lib/sellerApi';
import MemberPinGate, { isMemberPinMissing } from '../seller/MemberPinGate';

type MemberFields = { seller_member_id?: number; seller_member_pin?: string };
type ReduceBody = MemberFields & {
  adults: number; children: number; transfer_requested: boolean; reason?: string; notify_customer?: boolean;
  // Presente solo cuando la misma acción también reprograma la fecha: así el backend
  // manda un único email combinado en vez de uno por la reducción y otro por la fecha.
  reschedule_from?: string; reschedule_to?: string;
};
type IncreaseBody = MemberFields & { adults: number; children: number; reason?: string; notify_customer?: boolean };
type RescheduleBody = MemberFields & { new_date: string; reason?: string; notify_customer?: boolean };

// Handlers de API — el admin y el vendedor pasan los suyos. Los que falten deshabilitan
// esa operación (ej. el vendedor NO puede reintegrar por MP → reduceMp ausente).
export interface ModifyHandlers {
  reduceMp?: (body: ReduceBody) => Promise<unknown>;
  reduceCash?: (body: ReduceBody) => Promise<unknown>;
  increaseCash?: (body: IncreaseBody) => Promise<unknown>;
  addMp?: (body: { adults: number; children: number }) => Promise<{ init_point: string }>;
  reschedule?: (body: RescheduleBody) => Promise<unknown>;
}

interface Props {
  order: {
    public_id: string;
    // 'pix' nunca llega acá (el detalle de orden veda modificar reservas PIX), pero el
    // tipo lo acepta para cuadrar con el tipo de la orden en OrderDetail.
    payment_method: 'mercadopago' | 'cash' | 'pix';
    customer_name: string;
    customer_phone: string | null;
    total_usd: number;
    total_ars: number;
  };
  item: {
    adults: number;
    children: number;
    unit_price_adult_usd: string;
    unit_price_child_usd: string | null;
    subtotal_usd: string;
    service_date: string;
    option_id: number;
    option_name_snapshot: string;
  };
  handlers: ModifyHandlers;
  onClose: () => void;
  onDone: () => void;
  // Solo lo pasa el portal de vendedores (no el admin): si el vendedor tiene equipo
  // cargado, exige elegir quién hace el cambio + su PIN antes de dejar confirmar.
  members?: SellerMember[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtArs = (n: number) => `ARS ${Math.round(n).toLocaleString('es-AR')}`;

export default function ModifyReservationModal({ order, item, handlers, onClose, onDone, members }: Props) {
  const origAdults = item.adults;
  const origChildren = item.children;
  const unitAdult = Number(item.unit_price_adult_usd);
  const unitChild = item.unit_price_child_usd != null ? Number(item.unit_price_child_usd) : null;
  const subtotal = Number(item.subtotal_usd);

  // Porción de traslado inferida (lo que se cobró por encima de las entradas).
  const ticketsPortion = round2(origAdults * unitAdult + origChildren * (unitChild ?? 0));
  const transferPortion = Math.max(0, round2(subtotal - ticketsPortion));
  const origHasTransfer = transferPortion > 0.005;
  const transferPerPax = origHasTransfer ? transferPortion / (origAdults + origChildren) : 0;

  const [adults, setAdults] = useState(origAdults);
  const [children, setChildren] = useState(origChildren);
  const [keepTransfer, setKeepTransfer] = useState(origHasTransfer);
  const [newDate, setNewDate] = useState(item.service_date);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpLink, setMpLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Equipo cargado → hay que identificarse con PIN antes de poder confirmar cualquier cambio.
  const teamMembers = members ?? [];
  const [memberId, setMemberId] = useState<number | ''>('');
  const [memberPin, setMemberPin] = useState('');
  const memberFields: MemberFields = memberId !== ''
    ? { seller_member_id: memberId, seller_member_pin: memberPin }
    : {};
  const memberMissing = isMemberPinMissing(teamMembers, memberId, memberPin);

  const newPax = adults + children;
  const isIncreasing = newPax > origAdults + origChildren;
  const hasDateChange = newDate !== item.service_date;
  // Al AGREGAR pax, el traslado queda como estaba (no se puede togglear en la misma operación).
  const effectiveTransfer = isIncreasing ? origHasTransfer : keepTransfer;

  const preview = useMemo(() => {
    const newTickets = round2(adults * unitAdult + children * (unitChild ?? 0));
    const newTransfer = effectiveTransfer ? round2(transferPerPax * newPax) : 0;
    const newSubtotal = round2(newTickets + newTransfer);
    const delta = round2(newSubtotal - subtotal);
    const deltaArs = subtotal > 0 ? Math.round((Math.abs(delta) / subtotal) * order.total_ars) : 0;
    const newSubtotalArs = subtotal > 0 ? Math.round((newSubtotal / subtotal) * order.total_ars) : 0;
    let direction: 'none' | 'reduce' | 'increase' = 'none';
    if (delta < -0.005) direction = 'reduce';
    else if (delta > 0.005) direction = 'increase';
    return { newSubtotal, newSubtotalArs, delta, deltaArs, direction };
  }, [adults, children, effectiveTransfer, newPax, unitAdult, unitChild, transferPerPax, subtotal, order.total_ars]);

  const isMp = order.payment_method === 'mercadopago';
  const phoneDigits = (order.customer_phone ?? '').replace(/\D/g, '');

  // El vendedor no tiene operaciones sobre órdenes de Mercado Pago (lo hace el admin)
  // → reduceMp/addMp/reschedule ausentes cuando la orden es MP y el caller es el portal seller.
  const reduceBlocked = preview.direction === 'reduce' && isMp && !handlers.reduceMp;
  const increaseBlocked = preview.direction === 'increase' && isMp && !handlers.addMp;
  const rescheduleBlocked = hasDateChange && isMp && !handlers.reschedule;

  const confirmLabel = (() => {
    const hasPax = preview.direction !== 'none';
    if (!hasPax && !hasDateChange) return 'Sin cambios';
    if (!hasPax && hasDateChange) return rescheduleBlocked ? 'No disponible' : 'Reprogramar fecha';
    if (preview.direction === 'reduce') return hasDateChange ? 'Guardar cambios' : `Reintegrar ${fmtArs(preview.deltaArs)}`;
    if (isMp) return increaseBlocked ? 'No disponible' : (hasDateChange ? 'Guardar cambios' : `Generar link · ${fmtArs(preview.deltaArs)}`);
    return hasDateChange ? 'Guardar cambios' : `Registrar ampliación · ${fmtArs(preview.deltaArs)}`;
  })();

  const handleConfirm = async () => {
    setError(null);
    if (memberMissing) { setError('Elegí quién sos y tu PIN para confirmar el cambio.'); return; }
    setProcessing(true);
    try {
      // Si además de la fecha también hay una reducción de pax, mandamos UN solo email
      // (el de la reducción, que incluye la reprogramación) en vez de dos por separado:
      // acá suprimimos el de reschedule y le pasamos la fecha anterior/nueva al reduce.
      const combiningWithReduce = hasDateChange && preview.direction === 'reduce';
      if (hasDateChange) {
        if (!handlers.reschedule) { setError('Reprogramación no disponible.'); setProcessing(false); return; }
        await handlers.reschedule({
          new_date: newDate, reason: reason.trim() || undefined,
          notify_customer: combiningWithReduce ? false : notify,
          ...memberFields,
        });
      }
      if (preview.direction === 'reduce') {
        const body: ReduceBody = {
          adults, children, transfer_requested: effectiveTransfer, reason: reason.trim() || undefined, notify_customer: notify,
          ...(combiningWithReduce ? { reschedule_from: item.service_date, reschedule_to: newDate } : {}),
          ...memberFields,
        };
        const fn = isMp ? handlers.reduceMp : handlers.reduceCash;
        if (!fn) { setError('Esta operación no está disponible.'); return; }
        await fn(body);
        onDone();
      } else if (preview.direction === 'increase') {
        if (isMp) {
          if (!handlers.addMp) { setError('Esta operación no está disponible.'); return; }
          const r = await handlers.addMp({ adults, children });
          setMpLink(r.init_point);
        } else {
          if (!handlers.increaseCash) { setError('Esta operación no está disponible.'); return; }
          await handlers.increaseCash({ adults, children, reason: reason.trim() || undefined, notify_customer: notify, ...memberFields });
          onDone();
        }
      } else if (hasDateChange) {
        onDone();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const copyLink = async () => {
    if (!mpLink) return;
    try {
      await navigator.clipboard.writeText(mpLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  // ── Pantalla del link de MP generado (agregar en MP) ──
  if (mpLink) {
    const waMsg = `Hola ${order.customer_name}, para sumar los pasajeros a tu reserva de ${item.option_name_snapshot} (${item.service_date}) pagá la diferencia acá: ${mpLink}`;
    const waUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(waMsg)}` : `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
    return (
      <Overlay>
        <div className="w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-7 text-center animate-modal-panel">
          <h2 className="font-display text-2xl text-cream mb-2">Link de ampliación generado</h2>
          <p className="text-sm text-cream/70 mb-5">
            Enviale este link al pasajero para que pague la diferencia (<strong className="text-gold">{fmtArs(preview.deltaArs)}</strong>).
            El lugar queda reservado hasta que pague; si no lo hace, caduca.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-gold/20 bg-ink/40 p-2 mb-3">
            <span className="flex-1 truncate text-left text-xs text-cream/60 px-1">{mpLink}</span>
            <button onClick={copyLink} className="shrink-0 rounded-md border border-gold/30 px-3 py-1.5 text-xs text-cream hover:bg-gold/10 transition">
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-ink hover:brightness-95 transition mb-3">
            Enviar por WhatsApp{phoneDigits ? ' al pasajero' : ''}
          </a>
          <button onClick={() => { onDone(); }} className="w-full rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition">
            Listo
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div className="w-full max-w-lg rounded-2xl bg-ink-soft border border-gold/20 my-8 animate-modal-panel">
        <header className="p-6 border-b border-gold/10">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Modificar reserva</p>
          <h2 className="mt-2 font-display text-2xl text-cream">{item.option_name_snapshot}</h2>
          <p className="mt-1 text-sm text-cream/50">
            Actual: {origAdults} ad{origChildren > 0 ? ` · ${origChildren} men` : ''}{origHasTransfer ? ' · c/traslado' : ''} — {fmtArs(order.total_ars)}
          </p>
        </header>

        <div className="p-6 space-y-5">
          {/* Reprogramar fecha */}
          <div>
            <span className="block text-sm text-cream/80 mb-1.5">Fecha del servicio</span>
            <AvailabilityCalendar
              optionId={item.option_id}
              value={newDate}
              currentDate={item.service_date}
              onChange={setNewDate}
            />
            {hasDateChange && (
              <p className="mt-1.5 text-xs text-gold-soft">
                Reprogramando de <strong>{item.service_date}</strong> a <strong>{newDate}</strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Adultos" value={adults} min={1} max={20} onChange={setAdults} />
            {(origChildren > 0 || unitChild != null) && (
              <Stepper label="Menores" value={children} min={0} max={20} onChange={setChildren} />
            )}
          </div>

          {origHasTransfer && (
            <label className={`flex items-center gap-2 text-sm ${isIncreasing ? 'opacity-40' : ''}`}>
              <Checkbox checked={effectiveTransfer} disabled={isIncreasing} onChange={setKeepTransfer} />
              <span className="text-cream/80">Mantener traslado {isIncreasing && '(no se puede quitar al agregar pax)'}</span>
            </label>
          )}

          {/* Preview del delta */}
          <div className={`rounded-lg border p-4 space-y-1 ${
            preview.direction === 'reduce' ? 'border-bordeaux-light/40 bg-bordeaux-deep/15'
            : (preview.direction === 'increase' || hasDateChange) ? 'border-gold/30 bg-gold/5'
            : 'border-cream/15 bg-ink/30'
          }`}>
            {preview.direction === 'none' && !hasDateChange && <p className="text-sm text-cream/60">Sin cambios respecto de la reserva actual.</p>}
            {hasDateChange && !rescheduleBlocked && (
              <p className="text-sm text-cream/80">
                Nueva fecha: <strong className="text-cream">{newDate}</strong>
              </p>
            )}
            {rescheduleBlocked && (
              <p className="text-sm text-bordeaux-light">
                Las reservas de Mercado Pago las reprograma el administrador. Pedile al cliente que se contacte con nosotros.
              </p>
            )}
            {preview.direction === 'reduce' && !reduceBlocked && (
              <p className="text-sm text-cream/80">
                {isMp ? 'Se reintegrará al cliente ' : 'El vendedor devuelve en efectivo '}
                <strong className="text-cream">{fmtArs(preview.deltaArs)}</strong>.
                Nuevo total: <strong className="text-cream">{fmtArs(preview.newSubtotalArs)}</strong>.
              </p>
            )}
            {reduceBlocked && (
              <p className="text-sm text-bordeaux-light">
                El reintegro de reservas por Mercado Pago lo realiza el administrador. Pedile que lo procese.
              </p>
            )}
            {preview.direction === 'increase' && !increaseBlocked && (
              <p className="text-sm text-cream/80">
                {isMp ? 'Se generará un link de MP por ' : 'Se registra una ampliación pendiente de cobro por '}
                <strong className="text-cream">{fmtArs(preview.deltaArs)}</strong>.
                Nuevo total: <strong className="text-cream">{fmtArs(preview.newSubtotalArs)}</strong>.
                {isMp ? ' El pasajero paga con su cuenta.' : ' Confirmás el cobro después, cuando recibas el dinero.'}
              </p>
            )}
            {increaseBlocked && (
              <p className="text-sm text-bordeaux-light">
                Las ampliaciones de reservas de Mercado Pago las gestiona el administrador. Pedile al cliente que se contacte con nosotros.
              </p>
            )}
          </div>

          {preview.direction === 'reduce' && (
            <label className="block">
              <span className="block text-sm text-cream/80 mb-1.5">Motivo (opcional, lo ve el cliente)</span>
              <input type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
            </label>
          )}

          {preview.direction === 'reduce' && (
            <label className="flex items-center gap-2">
              <Checkbox checked={notify} onChange={setNotify} />
              <span className="text-sm text-cream/80">Notificar por email al cliente</span>
            </label>
          )}
          {preview.direction === 'increase' && !isMp && (
            <p className="text-xs text-cream/40">El cliente recibe el email de confirmación cuando confirmás el cobro.</p>
          )}

          <MemberPinGate
            members={teamMembers}
            memberId={memberId}
            memberPin={memberPin}
            onMemberIdChange={setMemberId}
            onPinChange={setMemberPin}
            label="¿Quién sos? Tu equipo está cargado — necesitamos tu PIN para confirmar este cambio."
          />

          {error && <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">{error}</div>}
        </div>

        <div className="p-6 border-t border-gold/10 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={processing} className="btn-ghost text-sm disabled:opacity-40">Cancelar</button>
          <button type="button" onClick={handleConfirm} disabled={processing || (preview.direction === 'none' && !hasDateChange) || reduceBlocked || increaseBlocked || rescheduleBlocked || memberMissing}
            className="btn-primary text-sm disabled:opacity-40">
            {processing ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
      {children}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="block text-sm text-cream/80 mb-1.5">{label}</span>
      <div className="flex items-center rounded-md border border-gold/20 bg-ink/40 overflow-hidden">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="px-3 py-2 text-cream hover:bg-gold/10 transition" aria-label="menos">−</button>
        <span className="flex-1 text-center text-cream tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)} className="px-3 py-2 text-cream hover:bg-gold/10 transition" aria-label="más">+</button>
      </div>
    </div>
  );
}
