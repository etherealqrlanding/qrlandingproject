import { useEffect, useMemo, useState } from 'react';
import AvailabilityCalendar from '../AvailabilityCalendar';
import Checkbox from '../Checkbox';
import NumberStepper from '../NumberStepper';
import TransferSection from '../TransferSection';
import HotelPicker from '../HotelPicker';
import { zoneForHotel } from '../../lib/hotels';
import type { SellerMember } from '../../lib/sellerApi';
import MemberPinGate, { isMemberPinMissing } from '../seller/MemberPinGate';

type MemberFields = { seller_member_id?: number; seller_member_pin?: string; admin_pin?: string };
type ReduceBody = MemberFields & {
  adults: number; children: number; transfer_qty: number; infants: number; reason?: string; notify_customer?: boolean;
  // Presente solo cuando la misma acción también reprograma la fecha: así el backend
  // manda un único email combinado en vez de uno por la reducción y otro por la fecha.
  reschedule_from?: string; reschedule_to?: string;
};
type IncreaseBody = MemberFields & {
  adults: number; children: number; infants?: number; reason?: string; notify_customer?: boolean;
  // Solo si la reserva nunca tuvo traslado -- si ya lo tenía, se extiende solo.
  add_transfer?: boolean; transfer_zone?: 'centro' | 'palermo'; transfer_hotel?: string; transfer_room?: string;
};
type AddMpBody = {
  adults: number; children: number; infants?: number;
  add_transfer?: boolean; transfer_zone?: 'centro' | 'palermo'; transfer_hotel?: string; transfer_room?: string;
};
type RescheduleBody = MemberFields & { new_date: string; reason?: string; notify_customer?: boolean };
type UpdateHotelBody = MemberFields & { hotel: string; room?: string | null };

// Handlers de API — el admin y el vendedor pasan los suyos. Los que falten deshabilitan
// esa operación (ej. el vendedor NO puede reintegrar por MP → reduceMp ausente).
export interface ModifyHandlers {
  reduceMp?: (body: ReduceBody) => Promise<unknown>;
  reduceCash?: (body: ReduceBody) => Promise<unknown>;
  increaseCash?: (body: IncreaseBody) => Promise<unknown>;
  // appliedImmediately=true (sin init_point) pasa cuando lo único que cambió fue
  // activar un traslado incluido sin costo -- ya se aplicó solo, no hay link que pagar.
  addMp?: (body: AddMpBody) => Promise<{ init_point?: string; appliedImmediately?: boolean }>;
  reschedule?: (body: RescheduleBody) => Promise<unknown>;
  // Corrige el hotel/habitación de un traslado ya activo -- no toca precio ni pax,
  // disponible tanto para el admin como para el vendedor (no depende del medio de pago).
  updateTransferHotel?: (body: UpdateHotelBody) => Promise<unknown>;
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
    transfer_qty: number;
    transfer_hotel?: string | null;
    transfer_room?: string | null;
    infants: number;
    infant_transfer_usd: string;
    service_date: string;
    option_id: number;
    option_name_snapshot: string;
    // Del tier -- deciden si se puede activar/extender traslado al aumentar pax.
    transfer_mode: 'none' | 'optional' | 'included';
    transfer_price_usd: number;
    transfer_price_usd_palermo: number | null;
  };
  handlers: ModifyHandlers;
  onClose: () => void;
  onDone: () => void;
  // Solo lo pasa el portal de vendedores (no el admin): si el vendedor tiene equipo
  // cargado, exige elegir quién hace el cambio + su PIN antes de dejar confirmar.
  members?: SellerMember[];
  // Identidad ya validada para esta orden (ver OrderMemberGate en SellerOrders) —
  // si viene, se usa directo y no se pide el PIN de nuevo acá.
  unlockedMember?: { memberId: number; pin: string } | null;
  onMemberValidated?: (memberId: number, pin: string) => void;
  // Idem, pero para cuando el administrador del vendedor ya se identificó con su
  // propio PIN para esta orden (ver OrderMemberGate) — se usa directo, sin volver
  // a pedirlo ni mostrar el toggle de "usar PIN de administrador".
  unlockedAdminPin?: string | null;
  onAdminValidated?: (pin: string) => void;
  // Modo abierto (sellers.team_pin_required = false): no se pide identificarse para
  // confirmar el cambio. Default true para no romper al admin (nunca lo pasa).
  pinRequired?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtArs = (n: number) => `ARS ${Math.round(n).toLocaleString('es-AR')}`;

export default function ModifyReservationModal({ order, item, handlers, onClose, onDone, members, unlockedMember, onMemberValidated, unlockedAdminPin, onAdminValidated, pinRequired = true }: Props) {
  const origAdults = item.adults;
  const origChildren = item.children;
  const unitAdult = Number(item.unit_price_adult_usd);
  const unitChild = item.unit_price_child_usd != null ? Number(item.unit_price_child_usd) : null;
  const subtotal = Number(item.subtotal_usd);

  const origTransferQty = item.transfer_qty;
  const origInfants = item.infants;
  const infantTransferUsd = Number(item.infant_transfer_usd);
  const transferMode = item.transfer_mode;
  // El traslado está en 0 en esta orden -- nunca se activó, o se rechazó/canceló
  // antes -- y se puede activar ahora para todo el grupo (viejo + nuevo) si el tier
  // lo permite ('optional' cobra, 'included' no). Si ya estaba activo, siempre se
  // extiende automático al aumentar (no es opcional, ver orderIncrease.ts).
  const canActivateTransfer = transferMode !== 'none' && origTransferQty === 0;
  const transferAlreadyActive = origTransferQty > 0;
  // Porción de traslado = lo que se cobró por encima de las entradas, prorrateada
  // por la cantidad REAL de pax que llevaban traslado (no por el total de pax).
  // El cargo de traslado de infantes se guarda congelado aparte (infant_transfer_usd)
  // y se resta ANTES de prorratear el traslado de adultos/menores — mismo split que
  // hace el backend en orderReduction.ts/orderIncrease.ts, así el preview coincide
  // centavo a centavo.
  const ticketsPortion = round2(origAdults * unitAdult + origChildren * (unitChild ?? 0));
  const transferAndInfantPortion = Math.max(0, round2(subtotal - ticketsPortion));
  const transferPortion = Math.max(0, round2(transferAndInfantPortion - infantTransferUsd));
  const transferPerPaxFrozen = origTransferQty > 0 ? transferPortion / origTransferQty : 0;
  const infantTransferPerInfantFrozen = origInfants > 0 ? infantTransferUsd / origInfants : 0;

  const [adults, setAdults] = useState(origAdults);
  const [children, setChildren] = useState(origChildren);
  const [infants, setInfants] = useState(origInfants);
  // Reduce: traslado es todo (newPax) o nada -- nunca una cantidad parcial (mismo
  // "todo o nada" que rige desde el booking). Reemplaza el viejo stepper numérico.
  const [transferOn, setTransferOn] = useState(origTransferQty > 0);
  // Increase, solo si canActivateTransfer: el admin/vendedor decide activarlo ahora.
  const [addTransfer, setAddTransfer] = useState(false);
  const [transferHotel, setTransferHotel] = useState('');
  const [transferRoom, setTransferRoom] = useState('');
  const [newDate, setNewDate] = useState(item.service_date);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpLink, setMpLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Corregir el hotel de un traslado que YA está activo -- acción aparte del resto
  // (no toca precio ni pax), así que tiene su propio estado y se guarda al toque,
  // sin pasar por el flujo de confirmar arriba.
  const [editingHotel, setEditingHotel] = useState(false);
  const [editHotel, setEditHotel] = useState(item.transfer_hotel ?? '');
  const [editRoom, setEditRoom] = useState(item.transfer_room ?? '');
  const [hotelSaving, setHotelSaving] = useState(false);
  const [hotelSaveError, setHotelSaveError] = useState<string | null>(null);

  // Equipo cargado → hay que identificarse con PIN antes de poder confirmar cualquier
  // cambio, salvo que ya se haya validado antes para esta orden (unlockedMember). Si la
  // persona no está disponible y nadie tiene su PIN, el administrador del vendedor puede
  // autorizar con el suyo (useAdminOverride) — queda anotado en el historial como hecho
  // por el admin.
  const teamMembers = members ?? [];
  const [memberId, setMemberId] = useState<number | ''>('');
  const [memberPin, setMemberPin] = useState('');
  const [useAdminOverride, setUseAdminOverride] = useState(false);
  // Modo abierto: no hay nada que identificar, así que como mucho mandamos el
  // seller_member_id elegido (opcional, sin PIN) si el caller lo soporta -- acá ni
  // se ofrece, queda en null como venía siendo "sin especificar" para esta acción.
  const memberFields: MemberFields = !pinRequired
    ? {}
    : unlockedMember
      ? { seller_member_id: unlockedMember.memberId, seller_member_pin: unlockedMember.pin }
      : unlockedAdminPin
        ? { ...(memberId !== '' ? { seller_member_id: memberId } : {}), admin_pin: unlockedAdminPin }
        : useAdminOverride
          ? { ...(memberId !== '' ? { seller_member_id: memberId } : {}), admin_pin: memberPin }
          : (memberId !== '' ? { seller_member_id: memberId, seller_member_pin: memberPin } : {});
  const memberMissing = pinRequired && !unlockedMember && !unlockedAdminPin && (
    useAdminOverride ? !/^\d{4,6}$/.test(memberPin) : isMemberPinMissing(teamMembers, memberId, memberPin)
  );

  const origPax = origAdults + origChildren;
  const newPax = adults + children;
  // No alcanza con tocar "Sí": mientras no haya un hotel elegido de la lista, no se
  // puede activar el traslado (no sabríamos dónde pasar a buscar al pasajero).
  const wantsFreshTransfer = canActivateTransfer && addTransfer && transferHotel.trim().length > 0;
  const transferMissingHotel = canActivateTransfer && addTransfer && transferHotel.trim().length === 0;
  // Aumenta si suben pax, suben infantes, o se activa el traslado por primera vez
  // (esto último puede pasar sin tocar ningún número de pasajeros).
  const isIncreasing = newPax > origPax || infants > origInfants || wantsFreshTransfer;
  const hasDateChange = newDate !== item.service_date;

  // Infantes: al REDUCIR no pueden superar los originales; al AUMENTAR no pueden
  // bajar de los originales (nunca se "pierden" infantes agregando pax).
  useEffect(() => {
    setInfants((v) => (isIncreasing ? Math.max(v, origInfants) : Math.min(v, origInfants)));
  }, [isIncreasing, origInfants]);

  // Zona resuelta del hotel elegido para activar el traslado -- decide si corresponde
  // el precio de Palermo o el de zona céntrica.
  const freshTransferZone = zoneForHotel(transferHotel || null);
  const freshTransferPriceUsd = freshTransferZone === 'palermo' && item.transfer_price_usd_palermo != null
    ? item.transfer_price_usd_palermo
    : item.transfer_price_usd;

  // Tipo de cambio implícito de la orden (coherente con el total ya cobrado) -- se usa
  // para convertir cada línea del desglose a ARS, igual que el delta total.
  const arsRate = subtotal > 0 ? order.total_ars / subtotal : 0;

  const preview = useMemo(() => {
    const lines: { label: string; usd: number }[] = [];
    if (isIncreasing) {
      const extraAdults = adults - origAdults;
      const extraChildren = children - origChildren;
      const extraInfants = infants - origInfants;
      const newTickets = round2(adults * unitAdult + children * (unitChild ?? 0));
      let newTransferQty = 0;
      let transferAdded = false;
      let transferRatePerPax = 0;
      if (transferMode === 'optional') {
        if (transferAlreadyActive) {
          newTransferQty = newPax;
          transferRatePerPax = transferPerPaxFrozen;
        } else if (wantsFreshTransfer) {
          newTransferQty = newPax;
          transferRatePerPax = freshTransferPriceUsd;
          transferAdded = true;
        }
      } else if (transferMode === 'included') {
        if (transferAlreadyActive) {
          newTransferQty = newPax;
        } else if (wantsFreshTransfer) {
          newTransferQty = newPax;
          transferAdded = true;
        }
      }
      const newTransferPortion = transferMode === 'optional' ? round2(transferRatePerPax * newTransferQty) : 0;
      const oldTransferPortion = transferAlreadyActive ? round2(transferPerPaxFrozen * origTransferQty) : 0;
      const infantTransferApplies = transferMode === 'optional' && newTransferQty > 0;
      const newInfantTransfer = infantTransferApplies ? round2(transferRatePerPax * infants) : 0;
      const newSubtotal = round2(newTickets + newTransferPortion + newInfantTransfer);
      const delta = round2(newSubtotal - subtotal);
      const deltaArs = subtotal > 0 ? Math.round((Math.abs(delta) / subtotal) * order.total_ars) : 0;
      const newSubtotalArs = subtotal > 0 ? Math.round((newSubtotal / subtotal) * order.total_ars) : 0;

      if (extraAdults > 0) lines.push({ label: `Adultos: ${origAdults} → ${adults} (+${extraAdults})`, usd: round2(extraAdults * unitAdult) });
      if (extraChildren > 0) lines.push({ label: `Menores: ${origChildren} → ${children} (+${extraChildren})`, usd: round2(extraChildren * (unitChild ?? 0)) });
      if (extraInfants > 0) lines.push({ label: `Infantes: ${origInfants} → ${infants} (+${extraInfants}, sin costo de entrada)`, usd: 0 });
      // Traslado de grupo + traslado de infantes van en UNA sola línea con un único
      // total -- desglosarlos aparte confunde más de lo que aclara (el infante
      // siempre viaja con el mismo traslado del grupo, nunca por separado).
      const transferDeltaUsd = round2(newTransferPortion - oldTransferPortion);
      const infantTransferDeltaUsd = round2(newInfantTransfer - infantTransferUsd);
      const combinedTransferDeltaUsd = round2(transferDeltaUsd + infantTransferDeltaUsd);
      if (transferAdded) {
        lines.push({ label: `Traslado: se activa para los ${newPax + infants} pasajero${(newPax + infants) !== 1 ? 's' : ''}`, usd: combinedTransferDeltaUsd });
      } else if (transferMode === 'optional' && transferAlreadyActive && (newTransferQty > origTransferQty || infantTransferDeltaUsd > 0.005)) {
        lines.push({ label: `Traslado: se extiende a ${newPax + infants} pasajeros`, usd: combinedTransferDeltaUsd });
      } else if (transferMode === 'included' && transferAlreadyActive && newPax > origPax) {
        lines.push({ label: `Traslado incluido: se extiende a ${newPax} pasajeros (sin cargo)`, usd: 0 });
      }

      return {
        newSubtotal, newSubtotalArs, delta, deltaArs, lines,
        // Siempre 'increase' acá adentro: para entrar a esta rama, isIncreasing ya
        // exigió que algo real haya cambiado (pax, infantes, o traslado activado) --
        // no todos esos casos generan cobro (infantes y el traslado incluido son
        // gratis), pero igual son un cambio real que hay que guardar.
        direction: 'increase' as const,
        transferAdded,
      };
    }
    const removedAdults = origAdults - adults;
    const removedChildren = origChildren - children;
    const removedInfants = origInfants - infants;
    const effectiveTransferQty = transferOn ? Math.min(origTransferQty || newPax, newPax) : 0;
    const newTickets = round2(adults * unitAdult + children * (unitChild ?? 0));
    const newTransfer = round2(transferPerPaxFrozen * effectiveTransferQty);
    // Si se cancela el traslado del grupo, el de infantes se cancela junto (no puede
    // quedar cobrándose un traslado de infante para un grupo que ya no lo tiene).
    const newInfantTransfer = effectiveTransferQty > 0 ? round2(infantTransferPerInfantFrozen * infants) : 0;
    const newSubtotal = round2(newTickets + newTransfer + newInfantTransfer);
    const delta = round2(newSubtotal - subtotal);
    const deltaArs = subtotal > 0 ? Math.round((Math.abs(delta) / subtotal) * order.total_ars) : 0;
    const newSubtotalArs = subtotal > 0 ? Math.round((newSubtotal / subtotal) * order.total_ars) : 0;

    if (removedAdults > 0) lines.push({ label: `Adultos: ${origAdults} → ${adults} (-${removedAdults})`, usd: -round2(removedAdults * unitAdult) });
    if (removedChildren > 0) lines.push({ label: `Menores: ${origChildren} → ${children} (-${removedChildren})`, usd: -round2(removedChildren * (unitChild ?? 0)) });
    if (removedInfants > 0) lines.push({ label: `Infantes: ${origInfants} → ${infants} (-${removedInfants})`, usd: 0 });
    // Traslado de grupo + traslado de infantes en UNA sola línea con un único total
    // (el infante siempre viaja con el mismo traslado del grupo, nunca aparte).
    const transferDeltaUsd = round2(newTransfer - transferPortion);
    const infantTransferDeltaUsd = round2(newInfantTransfer - infantTransferUsd);
    const combinedTransferDeltaUsd = round2(transferDeltaUsd + infantTransferDeltaUsd);
    if (combinedTransferDeltaUsd < -0.005) {
      lines.push({
        label: transferOn ? `Traslado: ${origTransferQty} → ${effectiveTransferQty} pasajeros` : `Traslado: cancelado (antes ${origTransferQty} pasajeros)`,
        usd: combinedTransferDeltaUsd,
      });
    }

    return {
      newSubtotal, newSubtotalArs, delta, deltaArs, lines,
      direction: delta < -0.005 ? ('reduce' as const) : ('none' as const),
      transferAdded: false,
    };
  }, [
    isIncreasing, adults, children, infants, unitAdult, unitChild, subtotal, order.total_ars,
    transferMode, transferAlreadyActive, wantsFreshTransfer, transferPerPaxFrozen, freshTransferPriceUsd,
    newPax, transferOn, origTransferQty, infantTransferPerInfantFrozen, origAdults, origChildren, origInfants,
    origPax, transferPortion, infantTransferUsd,
  ]);

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
    // Infantes solos y/o traslado incluido activado: no genera cobro, se aplica
    // directo (nada que pagar, ni link que generar).
    if (preview.direction === 'increase' && preview.deltaArs === 0) {
      return increaseBlocked ? 'No disponible' : (hasDateChange ? 'Guardar cambios' : (preview.transferAdded ? 'Activar traslado' : 'Guardar cambios'));
    }
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
        const effectiveTransferQty = transferOn ? Math.min(origTransferQty || newPax, newPax) : 0;
        const effectiveInfants = Math.min(infants, origInfants);
        const body: ReduceBody = {
          adults, children, transfer_qty: effectiveTransferQty, infants: effectiveInfants, reason: reason.trim() || undefined, notify_customer: notify,
          ...(combiningWithReduce ? { reschedule_from: item.service_date, reschedule_to: newDate } : {}),
          ...memberFields,
        };
        const fn = isMp ? handlers.reduceMp : handlers.reduceCash;
        if (!fn) { setError('Esta operación no está disponible.'); return; }
        await fn(body);
        onDone();
      } else if (preview.direction === 'increase') {
        const transferFields = wantsFreshTransfer
          ? {
              add_transfer: true as const,
              transfer_zone: freshTransferZone,
              transfer_hotel: transferHotel || undefined,
              transfer_room: transferRoom || undefined,
            }
          : {};
        if (isMp) {
          if (!handlers.addMp) { setError('Esta operación no está disponible.'); return; }
          const r = await handlers.addMp({ adults, children, infants, ...transferFields });
          if (r.appliedImmediately || !r.init_point) {
            // Traslado incluido activado sin costo: no hay link que mostrar, ya quedó listo.
            onDone();
          } else {
            setMpLink(r.init_point);
          }
        } else {
          if (!handlers.increaseCash) { setError('Esta operación no está disponible.'); return; }
          await handlers.increaseCash({ adults, children, infants, ...transferFields, reason: reason.trim() || undefined, notify_customer: notify, ...memberFields });
          onDone();
        }
      } else if (hasDateChange) {
        onDone();
      }
      // Llegamos hasta acá sin excepción → algo se validó recién con el backend, lo
      // cacheamos para esta orden (así las próximas acciones no lo vuelven a pedir).
      if (!unlockedMember && !unlockedAdminPin) {
        if (useAdminOverride) onAdminValidated?.(memberPin);
        else if (memberId !== '') onMemberValidated?.(memberId, memberPin);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const saveHotel = async () => {
    if (!handlers.updateTransferHotel) return;
    if (memberMissing) { setHotelSaveError('Elegí quién sos y tu PIN para confirmar el cambio.'); return; }
    setHotelSaving(true);
    setHotelSaveError(null);
    try {
      await handlers.updateTransferHotel({ hotel: editHotel.trim(), room: editRoom.trim() || undefined, ...memberFields });
      setEditingHotel(false);
      onDone();
    } catch (err) {
      setHotelSaveError((err as Error).message);
    } finally {
      setHotelSaving(false);
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
            Actual: {origAdults} ad{origChildren > 0 ? ` · ${origChildren} men` : ''}{origInfants > 0 ? ` · ${origInfants} inf` : ''}{origTransferQty > 0 ? ` · traslado ${origTransferQty}/${origAdults + origChildren}${transferMode === 'optional' ? ` (USD ${round2(transferPerPaxFrozen)}/pax)` : ''}` : ''} — {fmtArs(order.total_ars)}
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
            <NumberStepper label="Adultos" value={adults} min={1} max={20} onChange={setAdults} decrementLabel="menos" incrementLabel="más" />
            {(origChildren > 0 || unitChild != null) && (
              <NumberStepper label="Menores" value={children} min={0} max={20} onChange={setChildren} decrementLabel="menos" incrementLabel="más" />
            )}
          </div>

          {/* Siempre visible (no gateada por isIncreasing): igual que con el traslado,
              si dependiera de isIncreasing para mostrarse nunca se podría tocar cuando
              origInfants=0 -- el propio cambio acá es lo que puede hacer que
              isIncreasing pase a true. El efecto de abajo corrige el rango apenas
              cambia de dirección. */}
          <NumberStepper
            label="Infantes"
            value={infants}
            min={0}
            max={20}
            onChange={setInfants}
            decrementLabel="menos"
            incrementLabel="más"
          />

          {/* Traslado -- REDUCIR: toggle Sí/No (todo o nada, nunca una cantidad parcial) */}
          {!isIncreasing && transferAlreadyActive && (
            <div>
              <span className="block text-sm text-cream/80 mb-1.5">Traslado</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setTransferOn(true)}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${transferOn ? 'bg-gold text-ink' : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'}`}
                >
                  Mantener
                </button>
                <button
                  type="button"
                  onClick={() => setTransferOn(false)}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${!transferOn ? 'bg-bordeaux-light text-ink' : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'}`}
                >
                  Cancelar traslado
                </button>
              </div>
              {!transferOn && (
                <p className="mt-1.5 text-xs text-cream/40">
                  Se cancela el traslado para los {newPax} pasajero{newPax !== 1 ? 's' : ''}{infants > 0 ? ' (incluidos los infantes)' : ''}.
                </p>
              )}
            </div>
          )}

          {/* Traslado -- AUMENTAR: si ya estaba activo se extiende solo; si el tier lo
              permite y no lo tenía, se puede activar ahora para todo el grupo. */}
          {isIncreasing && transferAlreadyActive && transferMode === 'optional' && (
            <p className="text-xs text-gold-soft">
              🚐 El traslado ya activo se extiende automáticamente a los {newPax} pasajeros del grupo — se cobra la parte de los nuevos a <strong>USD {round2(transferPerPaxFrozen)}/pax</strong> ({fmtArs(Math.round(transferPerPaxFrozen * arsRate))}/pax).
            </p>
          )}
          {isIncreasing && transferAlreadyActive && transferMode === 'included' && (
            <p className="text-xs text-cream/40">🚐 El traslado sigue incluido para todo el grupo, sin cargo aparte.</p>
          )}

          {/* Traslado ya activo: mostrar (y permitir corregir) el hotel/habitación que
              cargó el cliente -- el vendedor puede necesitar cambiarlo si el pasajero
              se mudó de hotel o lo tipeó mal. No afecta precio ni pax, se guarda solo. */}
          {transferAlreadyActive && (
            <div className="rounded-lg border border-gold/15 bg-ink/30 p-4 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-cream/90">🚐 Hotel del traslado</p>
                  {!editingHotel && (
                    <p className="text-xs text-cream/60 mt-0.5">
                      {item.transfer_hotel
                        ? <>{item.transfer_hotel}{item.transfer_room ? ` · Hab. ${item.transfer_room}` : ''}</>
                        : 'Sin hotel asignado.'}
                    </p>
                  )}
                </div>
                {!editingHotel && handlers.updateTransferHotel && (
                  <button
                    type="button"
                    onClick={() => { setEditHotel(item.transfer_hotel ?? ''); setEditRoom(item.transfer_room ?? ''); setHotelSaveError(null); setEditingHotel(true); }}
                    className="text-xs text-cream/40 hover:text-cream underline underline-offset-2"
                  >
                    Cambiar hotel
                  </button>
                )}
              </div>
              {editingHotel && (
                <div className="space-y-3">
                  <HotelPicker hotel={editHotel} room={editRoom} onHotelChange={setEditHotel} onRoomChange={setEditRoom} />
                  {hotelSaveError && <p className="text-xs text-bordeaux-light">{hotelSaveError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!editHotel.trim() || hotelSaving}
                      onClick={saveHotel}
                      className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
                    >
                      {hotelSaving ? 'Guardando...' : 'Guardar hotel'}
                    </button>
                    <button type="button" onClick={() => setEditingHotel(false)} disabled={hotelSaving} className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-40">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No se gatea con isIncreasing: el toggle de acá ADENTRO (Sí/No de
              TransferSection) es lo único que puede hacer que isIncreasing pase a
              true cuando no se tocó ningún pasajero -- si se gatea con isIncreasing,
              nunca se podría llegar a tocarlo (huevo y gallina). */}
          {canActivateTransfer && (
            <TransferSection
              totalPax={newPax + infants}
              hotel={transferHotel}
              room={transferRoom}
              onHotelChange={setTransferHotel}
              onRoomChange={setTransferRoom}
              included={transferMode === 'included'}
              wanted={addTransfer}
              onWantedChange={setAddTransfer}
              pricePerPax={freshTransferPriceUsd}
              hasZonePricing={item.transfer_price_usd_palermo != null}
              zone={freshTransferZone}
            />
          )}
          {transferMissingHotel && (
            <p className="text-xs text-bordeaux-light">
              ⚠ Elegí un hotel de la lista para poder activar el traslado.
            </p>
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
                Las reservas pagadas con tarjeta las reprograma el administrador. Pedile al cliente que se contacte con nosotros.
              </p>
            )}
            {preview.direction === 'reduce' && !reduceBlocked && (
              <p className="text-sm text-cream/80">
                {isMp ? 'Se reintegrará al cliente ' : 'El recomendador devuelve en efectivo '}
                <strong className="text-cream">{fmtArs(preview.deltaArs)}</strong>.
                Nuevo total: <strong className="text-cream">{fmtArs(preview.newSubtotalArs)}</strong>.
              </p>
            )}
            {reduceBlocked && (
              <p className="text-sm text-bordeaux-light">
                El reintegro de reservas pagadas con tarjeta lo realiza el administrador. Pedile que lo procese.
              </p>
            )}
            {preview.direction === 'increase' && !increaseBlocked && preview.deltaArs === 0 && (
              <p className="text-sm text-cream/80">
                {preview.transferAdded
                  ? 'No genera ningún cobro — el traslado incluido no tiene costo aparte. Se activa al confirmar, sin pasos pendientes.'
                  : 'No genera ningún cobro — los infantes no pagan entrada. Se guarda al confirmar, sin pasos pendientes.'}
              </p>
            )}
            {preview.direction === 'increase' && !increaseBlocked && preview.deltaArs > 0 && (
              <p className="text-sm text-cream/80">
                {isMp ? 'Se generará un link de pago con tarjeta por ' : 'Se registra una ampliación pendiente de cobro por '}
                <strong className="text-cream">{fmtArs(preview.deltaArs)}</strong>.
                Nuevo total: <strong className="text-cream">{fmtArs(preview.newSubtotalArs)}</strong>.
                {isMp ? ' El pasajero paga con su cuenta.' : ' Confirmás el cobro después, cuando recibas el dinero.'}
              </p>
            )}
            {increaseBlocked && (
              <p className="text-sm text-bordeaux-light">
                Las ampliaciones de reservas pagadas con tarjeta las gestiona el administrador. Pedile al cliente que se contacte con nosotros.
              </p>
            )}

            {/* Desglose línea por línea de qué cambió y cuánto suma/resta cada cosa --
                sin esto no queda claro si lo que se movió fue pax, traslado, o ambos. */}
            {preview.lines.length > 0 && ((preview.direction === 'increase' && !increaseBlocked) || (preview.direction === 'reduce' && !reduceBlocked)) && (
              <div className="mt-2 pt-2 border-t border-cream/10 space-y-1">
                {preview.lines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-cream/60">{line.label}</span>
                    <span className={line.usd > 0 ? 'text-gold' : line.usd < 0 ? 'text-bordeaux-light' : 'text-cream/40'}>
                      {line.usd === 0 ? 'sin costo' : `${line.usd > 0 ? '+' : '-'}${fmtArs(Math.round(Math.abs(line.usd) * arsRate))}`}
                    </span>
                  </div>
                ))}
              </div>
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
          {preview.direction === 'increase' && !isMp && preview.deltaArs === 0 && (
            <p className="text-xs text-cream/40">
              {preview.transferAdded
                ? 'El cliente recibe un email confirmando el traslado apenas confirmás acá.'
                : 'El cliente recibe un email confirmando el cambio apenas confirmás acá.'}
            </p>
          )}
          {preview.direction === 'increase' && !isMp && preview.deltaArs > 0 && (
            <p className="text-xs text-cream/40">El cliente recibe el email de confirmación cuando confirmás el cobro.</p>
          )}

          {pinRequired && !unlockedMember && !unlockedAdminPin && (
            <div>
              <MemberPinGate
                members={teamMembers}
                memberId={memberId}
                memberPin={memberPin}
                onMemberIdChange={setMemberId}
                onPinChange={setMemberPin}
                label={useAdminOverride
                  ? 'PIN de administrador — autorizás vos porque la persona no está disponible.'
                  : '¿Quién sos? Tu equipo está cargado — necesitamos tu PIN para confirmar este cambio.'}
                pinPlaceholder={useAdminOverride ? 'PIN de administrador' : undefined}
              />
              {teamMembers.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setUseAdminOverride((v) => !v); setMemberPin(''); }}
                  className="-mt-3 mb-5 text-[10px] text-cream/40 hover:text-cream/70 transition underline underline-offset-2"
                >
                  {useAdminOverride ? 'usar el PIN de la persona' : '¿la persona no está? usar PIN de administrador'}
                </button>
              )}
            </div>
          )}

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
