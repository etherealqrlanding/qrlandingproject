import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sellerApi, SellerApiError, SELLER_NOTIFICATION_EVENT, type SellerOrder, type SellerPendingAddon, type SellerMember } from '../../lib/sellerApi';
import DetailRow from '../../components/DetailRow';
import AttributionPicker from '../../components/seller/AttributionPicker';
import MemberPinGate, { isMemberPinMissing } from '../../components/seller/MemberPinGate';
import OrderMemberGate from '../../components/seller/OrderMemberGate';
import DateRangePicker from '../../components/DateRangePicker';
import SimpleSelect from '../../components/SimpleSelect';

function isWindowBlocked(hours: number | null, serviceDate: string): boolean {
  if (!hours) return false;
  const [y, m, d] = serviceDate.split('-').map(Number);
  const serviceMidnightUtcMs = Date.UTC(y, m - 1, d, 3, 0, 0); // medianoche BsAs = 03:00 UTC
  const hoursUntilService = (serviceMidnightUtcMs - Date.now()) / (60 * 60 * 1000);
  return hoursUntilService < hours;
}

function windowBlockMsg(hours: number | null): string {
  return `Se requieren al menos ${hours} hs de anticipación al servicio.`;
}
import ModifyReservationModal from '../../components/admin/ModifyReservationModal';
import OrderHistory from '../../components/OrderHistory';
import type { OrderEvent } from '../../lib/orderEvents';

// Estado mostrado al vendedor según método de pago + sub-estado real de la orden:
//  - Pendiente: reservó, todavía no se cobró.
//  - Cobrada:   efectivo cobrado por el vendedor, neto aún no rendido.
//  - Rendida:   efectivo cobrado y neto ya rendido al operador.
//  - Pagada:    Mercado Pago confirmado.
//  - Caducada:  efectivo no cobrado dentro de las 24 hs (cancelada automáticamente).
type DerivedKey = 'pending' | 'collected' | 'settled' | 'paid' | 'expired' | 'cancelled' | 'refunded' | 'failed';

const STATUS_CLASS: Record<DerivedKey, string> = {
  pending: 'bg-amber-900/30 text-amber-400 border border-amber-800/40',
  collected: 'bg-sky-900/30 text-sky-400 border border-sky-800/40',
  settled: 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
  paid: 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40',
  expired: 'bg-zinc-800/40 text-cream/40 border border-zinc-700/30',
  cancelled: 'bg-zinc-800/40 text-cream/40 border border-zinc-700/30',
  refunded: 'bg-blue-900/30 text-blue-400 border border-blue-800/40',
  failed: 'bg-bordeaux-deep/40 text-bordeaux-light border border-bordeaux-light/30',
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'collected', label: 'Cobradas' },
  { value: 'settled', label: 'Rendidas' },
  { value: 'paid', label: 'Pagadas (MP)' },
  { value: 'expired', label: 'Caducadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

const DERIVED_LABEL: Record<DerivedKey, string> = {
  pending: 'Pendiente',
  collected: 'Cobrada',
  settled: 'Rendida',
  paid: 'Pagada',
  expired: 'Caducada',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
  failed: 'Fallida',
};

function derivedStatus(o: SellerOrder): { key: DerivedKey; label: string; cls: string } {
  let key: DerivedKey;
  if (o.status === 'expired') key = 'expired';
  else if (o.status === 'cancelled') key = 'cancelled';
  else if (o.status === 'refunded') key = 'refunded';
  else if (o.status === 'failed') key = 'failed';
  else if (o.status === 'pending') key = 'pending';
  else if (o.payment_method === 'cash') key = o.net_settled_at ? 'settled' : 'collected';
  else key = 'paid';
  return { key, label: DERIVED_LABEL[key], cls: STATUS_CLASS[key] };
}

const TERMINAL_STATUSES = ['cancelled', 'refunded', 'expired', 'failed'];

// El vendedor puede archivar a mano: (a) algo que había restaurado y quiere volver a
// mandar al archivo, o (b) una orden ya cancelada/reintegrada/vencida/fallida que
// todavía sigue en "Mis Órdenes" porque no pasaron los días configurados de archivado
// automático — no tiene por qué esperar esa ventana si ya no la necesita a la vista.
function canArchiveManually(o: SellerOrder): boolean {
  return Boolean(o.restored_at) || TERMINAL_STATUSES.includes(o.status);
}
function archiveButtonLabel(o: SellerOrder, archiving: boolean): string {
  if (archiving) return 'Archivando...';
  return o.restored_at ? '📁 Volver a archivar' : '📁 Archivar ahora';
}

// Además del estado (que siempre se muestra), a lo sumo UNA etiqueta secundaria por
// fila — mostrar varias hacía quebrar la línea y rompía la tabla. Prioridad: lo más
// inusual/alertante primero (restaurada, reducida) antes que lo puramente informativo
// (efectivo, manual), que ya se puede ver al expandir la orden.
type ExtraBadgeKey = 'restored' | 'reduced' | 'cash' | 'manual';

function topExtraBadge(o: SellerOrder, includePayment: boolean): ExtraBadgeKey | null {
  if (o.restored_at) return 'restored';
  if (o.was_reduced) return 'reduced';
  if (includePayment) {
    if (o.payment_method === 'cash') return 'cash';
    if (o.utm_source === 'seller_portal') return 'manual';
  }
  return null;
}

const PAYMENT_LABEL: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  cash: 'Efectivo',
  pix: 'PIX',
};

// El portal muestra la plata en pesos (el negocio opera en ARS).
function fmtArs(ars: number) {
  return `ARS ${Math.round(ars).toLocaleString('es-AR')}`;
}

function fmtUsd(usd: number) {
  return `USD ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Comisión efectiva en ARS: usa el valor guardado si existe; si no (órdenes sin precio neto
// configurado), recalcula desde commission_percent_snapshot × total_ars.
function effectiveCommissionArs(o: SellerOrder): number {
  if (o.commission_amount_ars > 0 || o.net_total_usd != null) return o.commission_amount_ars;
  if (o.commission_percent_snapshot != null && o.commission_percent_snapshot > 0) {
    return Math.round(o.total_ars * o.commission_percent_snapshot / 100);
  }
  return 0;
}

// Neto a rendir formateado: si ya se cobró en USD, se muestra directo en dólares
// (sin convertir) porque el vendedor tiene los dólares en mano; si no, en ARS.
function netDisplay(o: SellerOrder): string {
  if (o.cash_collected_currency === 'USD' && o.net_total_usd != null) return fmtUsd(o.net_total_usd);
  return fmtArs(effectiveNetArs(o));
}

// Neto efectivo en ARS: usa net_total_usd × tasa si existe; si no, total − comisión estimada.
function effectiveNetArs(o: SellerOrder): number {
  if (o.net_total_usd != null) return Math.round(o.net_total_usd * o.exchange_rate_used);
  if (o.commission_percent_snapshot != null && o.commission_percent_snapshot > 0) {
    return Math.round(o.total_ars * (1 - o.commission_percent_snapshot / 100));
  }
  return 0;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function paxLabel(adults: number, children: number) {
  const parts = [`${adults} adulto${adults !== 1 ? 's' : ''}`];
  if (children > 0) parts.push(`${children} menor${children !== 1 ? 'es' : ''}`);
  return parts.join(' · ');
}

// Deriva original/actual/sumados a partir de los eventos cargados. Devuelve null
// en original/added cuando no hay eventos o la orden no fue modificada.
function paxDetail(o: SellerOrder, events?: OrderEvent[]) {
  const current = paxLabel(o.adults ?? 0, o.children ?? 0);
  if (!events || (!o.was_reduced && !o.has_paid_addon)) return { current, original: null, added: null };
  const modEvent = [...events].reverse().find(
    (e) => e.event_type === 'order_modified' && e.payload?.orig_adults != null,
  );
  const extraAdults = events.reduce((sum, e) => sum + Number(e.payload?.extra_adults ?? 0), 0);
  const extraChildren = events.reduce((sum, e) => sum + Number(e.payload?.extra_children ?? 0), 0);
  const original = modEvent
    ? paxLabel(Number(modEvent.payload!.orig_adults), Number(modEvent.payload!.orig_children))
    : null;
  const addedParts = [
    extraAdults > 0 ? `+${extraAdults} ad` : '',
    extraChildren > 0 ? `+${extraChildren} men` : '',
  ].filter(Boolean);
  return { current, original, added: addedParts.length > 0 ? addedParts.join(' · ') : null };
}

export default function SellerOrders() {
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');

  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(''); // '' = Todas (default)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [memberFilter, setMemberFilter] = useState<string>(''); // '' = todos
  const [expanded, setExpanded] = useState<number | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [confirmPublicId, setConfirmPublicId] = useState<string | null>(null);
  const [collectCurrency, setCollectCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [collectError, setCollectError] = useState<string | null>(null);
  const [members, setMembers] = useState<SellerMember[]>([]);
  const [collectMemberId, setCollectMemberId] = useState<number | ''>('');
  const [collectMemberPin, setCollectMemberPin] = useState('');
  const [modifyOrder, setModifyOrder] = useState<SellerOrder | null>(null);
  const [eventsByOrder, setEventsByOrder] = useState<Record<string, OrderEvent[]>>({});
  const [addonsByOrder, setAddonsByOrder] = useState<Record<string, SellerPendingAddon[]>>({});
  const [addonBusy, setAddonBusy] = useState<string | null>(null);
  const [modifyWindow, setModifyWindow] = useState<number | null>(null);
  const [cancelWindow, setCancelWindow] = useState<number | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState<string | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<SellerOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelMemberId, setCancelMemberId] = useState<number | ''>('');
  const [cancelMemberPin, setCancelMemberPin] = useState('');
  const [cancelAdminOverride, setCancelAdminOverride] = useState(false);
  const [archivingOrder, setArchivingOrder] = useState<string | null>(null);

  // Identidad ya validada por orden (public_id -> {memberId, pin}) — una vez que el
  // vendedor confirma su PIN una vez para una orden (por el gate dedicado o por
  // cualquiera de las acciones de abajo), el resto de las acciones sobre ESA misma
  // orden lo reusan en vez de volver a pedirlo. Vive solo en memoria — se pierde al
  // recargar la página, no se persiste en el navegador.
  const [unlockedMembers, setUnlockedMembers] = useState<Record<string, { memberId: number; pin: string }>>({});
  const markUnlocked = (publicId: string, memberId: number, pin: string) =>
    setUnlockedMembers((prev) => ({ ...prev, [publicId]: { memberId, pin } }));
  const relock = (publicId: string) =>
    setUnlockedMembers((prev) => { const next = { ...prev }; delete next[publicId]; return next; });

  // Misma idea que arriba, pero para cuando quien identifica la orden es el
  // administrador del vendedor (con su propio PIN) en vez de un sub-vendedor —
  // por ejemplo porque la persona correspondiente no está disponible.
  const [unlockedAdmin, setUnlockedAdmin] = useState<Record<string, string>>({});
  const markAdminUnlocked = (publicId: string, pin: string) =>
    setUnlockedAdmin((prev) => ({ ...prev, [publicId]: pin }));
  const relockAdmin = (publicId: string) =>
    setUnlockedAdmin((prev) => { const next = { ...prev }; delete next[publicId]; return next; });

  const reload = async () => {
    const data = await sellerApi.orders(filter || undefined);
    setOrders(data);
  };

  const loadAddons = (publicId: string) =>
    sellerApi.orderAddons(publicId)
      .then((ad) => setAddonsByOrder((prev) => ({ ...prev, [publicId]: ad })))
      .catch(() => {});

  // Al expandir una orden, traemos su histórico y sus ampliaciones pendientes.
  useEffect(() => {
    if (expanded == null) return;
    const o = orders.find((x) => x.order_id === expanded);
    if (!o) return;
    if (!eventsByOrder[o.public_id]) {
      sellerApi.orderEvents(o.public_id)
        .then((ev) => setEventsByOrder((prev) => ({ ...prev, [o.public_id]: ev })))
        .catch(() => {});
    }
    if (!addonsByOrder[o.public_id]) loadAddons(o.public_id);
  }, [expanded, orders, eventsByOrder, addonsByOrder]);

  const handleCollectAddon = async (orderPublicId: string, addonPublicId: string, member?: { seller_member_id: number; seller_member_pin: string }) => {
    setAddonBusy(addonPublicId);
    try {
      await sellerApi.collectAddon(addonPublicId, member);
      // Invalida el histórico cacheado: confirmar el cobro agrega un evento nuevo
      // ("cobro confirmado") que si no, quedaba sin verse hasta recargar la página entera.
      setEventsByOrder((prev) => { const next = { ...prev }; delete next[orderPublicId]; return next; });
      await reload();
      await loadAddons(orderPublicId);
    } catch (err) {
      alert((err as SellerApiError).message);
    } finally {
      setAddonBusy(null);
    }
  };

  const handleCancelAddon = async (orderPublicId: string, addonPublicId: string, member?: { seller_member_id: number; seller_member_pin: string }) => {
    setAddonBusy(addonPublicId);
    try {
      await sellerApi.cancelAddon(addonPublicId, member);
      // Mismo motivo: cancelar también agrega un evento nuevo al histórico.
      setEventsByOrder((prev) => { const next = { ...prev }; delete next[orderPublicId]; return next; });
      await loadAddons(orderPublicId);
    } catch (err) {
      alert((err as SellerApiError).message);
    } finally {
      setAddonBusy(null);
    }
  };

  // Ampliaciones: cobrar/cancelar también quedan detrás del PIN si hay equipo cargado.
  // Sin equipo, se ejecuta directo (mismo comportamiento de siempre).
  const [addonPrompt, setAddonPrompt] = useState<{ orderPublicId: string; addonPublicId: string; action: 'collect' | 'cancel' } | null>(null);
  const [addonMemberId, setAddonMemberId] = useState<number | ''>('');
  const [addonMemberPin, setAddonMemberPin] = useState('');
  const [addonPromptError, setAddonPromptError] = useState<string | null>(null);

  const requestAddonAction = (orderPublicId: string, addonPublicId: string, action: 'collect' | 'cancel') => {
    const unlocked = unlockedMembers[orderPublicId];
    if (members.length === 0 || unlocked) {
      const member = unlocked ? { seller_member_id: unlocked.memberId, seller_member_pin: unlocked.pin } : undefined;
      if (action === 'collect') handleCollectAddon(orderPublicId, addonPublicId, member);
      else handleCancelAddon(orderPublicId, addonPublicId, member);
      return;
    }
    setAddonPrompt({ orderPublicId, addonPublicId, action });
    setAddonMemberId('');
    setAddonMemberPin('');
    setAddonPromptError(null);
  };

  const confirmAddonAction = async () => {
    if (!addonPrompt) return;
    if (isMemberPinMissing(members, addonMemberId, addonMemberPin)) {
      setAddonPromptError('Elegí quién sos y tu PIN para confirmar.');
      return;
    }
    const member = { seller_member_id: addonMemberId as number, seller_member_pin: addonMemberPin };
    const { orderPublicId, addonPublicId, action } = addonPrompt;
    markUnlocked(orderPublicId, addonMemberId as number, addonMemberPin);
    setAddonPrompt(null);
    if (action === 'collect') await handleCollectAddon(orderPublicId, addonPublicId, member);
    else await handleCancelAddon(orderPublicId, addonPublicId, member);
  };

  const handleCancelOrder = (o: SellerOrder) => {
    setCancelConfirmOrder(o);
    setCancelReason('');
    setCancelError(null);
    setCancelMemberId('');
    setCancelMemberPin('');
    setCancelAdminOverride(false);
  };

  const handleCancelConfirm = async () => {
    if (!cancelConfirmOrder) return;
    const unlocked = unlockedMembers[cancelConfirmOrder.public_id];
    const adminUnlocked = unlockedAdmin[cancelConfirmOrder.public_id];
    if (!unlocked && !adminUnlocked) {
      if (cancelAdminOverride) {
        if (!/^\d{4,6}$/.test(cancelMemberPin)) {
          setCancelError('Ingresá el PIN de administrador (4-6 dígitos).');
          return;
        }
      } else if (isMemberPinMissing(members, cancelMemberId, cancelMemberPin)) {
        setCancelError('Elegí quién sos y tu PIN para confirmar.');
        return;
      }
    }
    setCancelingOrder(cancelConfirmOrder.public_id);
    setCancelError(null);
    try {
      const publicId = cancelConfirmOrder.public_id;
      const member = unlocked
        ? { seller_member_id: unlocked.memberId, seller_member_pin: unlocked.pin }
        : adminUnlocked
          ? { ...(cancelMemberId !== '' ? { seller_member_id: cancelMemberId } : {}), admin_pin: adminUnlocked }
          : cancelAdminOverride
            ? { ...(cancelMemberId !== '' ? { seller_member_id: cancelMemberId } : {}), admin_pin: cancelMemberPin }
            : (cancelMemberId !== '' ? { seller_member_id: cancelMemberId, seller_member_pin: cancelMemberPin } : undefined);
      await sellerApi.cancelOrder(publicId, cancelReason.trim() || undefined, member);
      if (!unlocked && !adminUnlocked) {
        if (cancelAdminOverride) markAdminUnlocked(publicId, cancelMemberPin);
        else if (cancelMemberId !== '') markUnlocked(publicId, cancelMemberId, cancelMemberPin);
      }
      setCancelConfirmOrder(null);
      // Cancelar agrega un evento nuevo al histórico — sin esto, si se reabre la fila
      // después de cancelar, se seguía viendo el histórico viejo hasta recargar la página.
      setEventsByOrder((prev) => { const next = { ...prev }; delete next[publicId]; return next; });
      await reload();
      setExpanded(null);
    } catch (err) {
      setCancelError((err as SellerApiError).message);
    } finally {
      setCancelingOrder(null);
    }
  };

  const handleArchiveOrder = async (publicId: string) => {
    setArchivingOrder(publicId);
    try {
      await sellerApi.archiveOrder(publicId);
      setEventsByOrder((prev) => { const next = { ...prev }; delete next[publicId]; return next; });
      await reload();
      setExpanded(null);
    } catch (err) {
      alert((err as SellerApiError).message);
    } finally {
      setArchivingOrder(null);
    }
  };

  // Bloque reutilizable de ampliaciones pendientes (mobile + desktop).
  const renderAddons = (o: SellerOrder) => {
    const list = addonsByOrder[o.public_id];
    if (!list || list.length === 0) return null;
    return (
      <div className="mt-3 pt-3 border-t border-gold/10 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Ampliaciones pendientes</p>
        {list.map((ad) => (
          <div key={ad.public_id} className="rounded-md border border-amber-500/20 bg-amber-950/10 p-3">
            <p className="text-sm text-cream/90">
              +{ad.extra_adults} ad{ad.extra_children > 0 ? ` · +${ad.extra_children} men` : ''} —
              <strong className="text-gold"> {fmtArs(ad.charge_ars)}</strong>
              <span className="text-cream/40 text-xs"> · {ad.payment_method === 'cash' ? 'Efectivo' : 'Mercado Pago'}</span>
            </p>
            {ad.payment_method === 'cash' ? (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); requestAddonAction(o.public_id, ad.public_id, 'collect'); }}
                  disabled={addonBusy === ad.public_id}
                  className="flex-1 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50">
                  {addonBusy === ad.public_id ? '...' : '✓ Confirmar cobro'}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); requestAddonAction(o.public_id, ad.public_id, 'cancel'); }}
                  disabled={addonBusy === ad.public_id}
                  className="rounded-md border border-gold/20 px-3 py-2 text-sm text-cream/60 hover:border-gold/40 transition disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-cream/45">Le enviamos el link de pago al pasajero por email.</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); requestAddonAction(o.public_id, ad.public_id, 'cancel'); }}
                  disabled={addonBusy === ad.public_id}
                  className="w-full rounded-md border border-gold/20 px-3 py-2 text-sm text-cream/60 hover:border-gold/40 transition disabled:opacity-50">
                  Cancelar ampliación
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

  // Auto-expand y scroll a la orden destacada una vez que carguen los datos
  useEffect(() => {
    if (!highlight || loading || orders.length === 0) return;
    const target = orders.find((o) => o.public_id === highlight);
    if (target) {
      setExpanded(target.order_id);
      setTimeout(() => {
        highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlight, loading, orders]);

  const openCollectModal = (publicId: string) => {
    setConfirmPublicId(publicId);
    setCollectCurrency('ARS');
    setCollectMemberId('');
    setCollectMemberPin('');
    setCollectError(null);
  };

  const handleCollect = async (publicId: string) => {
    const unlocked = unlockedMembers[publicId];
    if (!unlocked && isMemberPinMissing(members, collectMemberId, collectMemberPin)) {
      setCollectError('Elegí quién cobró y su PIN para confirmar.');
      return;
    }
    setCollecting(publicId);
    setCollectError(null);
    try {
      const member = unlocked
        ? { seller_member_id: unlocked.memberId, seller_member_pin: unlocked.pin }
        : (collectMemberId !== '' ? { seller_member_id: collectMemberId, seller_member_pin: collectMemberPin } : undefined);
      await sellerApi.collectCash(publicId, collectCurrency, member);
      if (!unlocked && collectMemberId !== '') markUnlocked(publicId, collectMemberId, collectMemberPin);
      setConfirmPublicId(null);
      setCollectMemberId('');
      setCollectMemberPin('');
      // Refrescar la lista
      const data = await sellerApi.orders(filter || undefined);
      setOrders(data);
      setExpanded(null);
    } catch (err) {
      setCollectError((err as SellerApiError).message);
    } finally {
      setCollecting(null);
    }
  };

  // Traemos todas las órdenes y filtramos en el cliente por estado derivado
  // (Cobrada/Rendida son sub-estados de 'paid', no se pueden filtrar server-side).
  const loadOrders = (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    Promise.all([sellerApi.orders(), sellerApi.operationWindows()])
      .then(([data, windows]) => {
        setOrders(data);
        setModifyWindow(windows.modify);
        setCancelWindow(windows.cancel);
        if (showSpinner) setExpanded(null);
      })
      .catch((err) => setError((err as SellerApiError).message))
      .finally(() => { if (showSpinner) setLoading(false); });
  };

  useEffect(() => {
    loadOrders(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sellerApi.members.list().then((list) => setMembers(list.filter((m) => m.is_active))).catch(() => {});
  }, []);

  // Push en vivo: cualquier notificación (venta nueva, ampliación, rendición, reserva
  // modificada por el equipo) puede afectar esta lista — la refrescamos sola en vez
  // de esperar a que el vendedor recargue a mano. Sin spinner para no interrumpir
  // si está mirando/expandiendo una fila.
  useEffect(() => {
    const handler = () => loadOrders(false);
    window.addEventListener(SELLER_NOTIFICATION_EVENT, handler);
    return () => window.removeEventListener(SELLER_NOTIFICATION_EVENT, handler);
  }, []);

  const visible = useMemo(() => {
    let list = orders;
    if (filter) list = list.filter((o) => derivedStatus(o).key === filter);
    if (dateFrom) list = list.filter((o) => o.created_at.slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter((o) => o.created_at.slice(0, 10) <= dateTo);
    if (memberFilter) list = list.filter((o) => String(o.seller_member_id ?? '') === memberFilter);
    return list;
  }, [orders, filter, dateFrom, dateTo, memberFilter]);

  const hasActiveFilters = Boolean(filter || dateFrom || dateTo || memberFilter);
  function clearFilters() { setFilter(''); setDateFrom(''); setDateTo(''); setMemberFilter(''); }

  const memberFilterOptions = useMemo(
    () => [{ value: '', label: 'Todos (equipo)' }, ...members.map((m) => ({ value: String(m.id), label: m.name }))],
    [members],
  );

  const pendingOrder = confirmPublicId
    ? orders.find((o) => o.public_id === confirmPublicId)
    : null;

  return (
    <>
    {modifyOrder && (
      <ModifyReservationModal
        order={{
          public_id: modifyOrder.public_id,
          payment_method: modifyOrder.payment_method === 'cash' ? 'cash' : 'mercadopago',
          customer_name: modifyOrder.customer_name,
          customer_phone: modifyOrder.customer_phone,
          total_usd: modifyOrder.total_usd,
          total_ars: modifyOrder.total_ars,
        }}
        item={{
          adults: modifyOrder.adults,
          children: modifyOrder.children,
          unit_price_adult_usd: String(modifyOrder.unit_price_adult_usd),
          unit_price_child_usd: modifyOrder.unit_price_child_usd != null ? String(modifyOrder.unit_price_child_usd) : null,
          subtotal_usd: String(modifyOrder.subtotal_usd),
          service_date: modifyOrder.service_date,
          option_id: modifyOrder.option_id,
          option_name_snapshot: modifyOrder.option_name,
        }}
        handlers={{
          reduceCash: (body) => sellerApi.reduceCash(modifyOrder.public_id, body),
          increaseCash: (body) => sellerApi.increaseCash(modifyOrder.public_id, body),
          // addMp ausente: el vendedor no genera links de MP, eso lo hace el administrador.
          ...(modifyOrder.payment_method !== 'mercadopago'
            ? { reschedule: (body) => sellerApi.reschedule(modifyOrder.public_id, body) }
            : {}),
        }}
        members={members}
        unlockedMember={unlockedMembers[modifyOrder.public_id] ?? null}
        onMemberValidated={(memberId, pin) => markUnlocked(modifyOrder.public_id, memberId, pin)}
        unlockedAdminPin={unlockedAdmin[modifyOrder.public_id] ?? null}
        onAdminValidated={(pin) => markAdminUnlocked(modifyOrder.public_id, pin)}
        onClose={() => setModifyOrder(null)}
        onDone={() => {
          const pid = modifyOrder.public_id;
          setModifyOrder(null);
          // Invalida caches de esta orden para que se recarguen con datos frescos
          setAddonsByOrder((prev) => { const next = { ...prev }; delete next[pid]; return next; });
          setEventsByOrder((prev) => { const next = { ...prev }; delete next[pid]; return next; });
          reload().catch(() => {});
        }}
      />
    )}
    {confirmPublicId && pendingOrder && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-6 md:p-8 animate-modal-panel">
            <h2 className="font-display text-2xl text-cream mb-2">Confirmar cobro</h2>
            <p className="text-sm text-cream/60 mb-5">
              ¿Confirmás que recibiste el dinero del pasajero para la siguiente reserva?
            </p>
            <div className="rounded-lg border border-gold/15 bg-ink/40 p-4 space-y-1.5 mb-6 text-sm">
              <div className="flex justify-between">
                <span className="text-cream/50">Pasajero</span>
                <span className="text-cream font-medium">{pendingOrder.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Servicio</span>
                <span className="text-cream/80">{pendingOrder.option_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Fecha</span>
                <span className="text-cream/80">{fmtDate(pendingOrder.service_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Sugerido</span>
                <span className="text-cream/70 font-mono">{fmtArs(pendingOrder.total_ars)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Neto a rendir</span>
                <span className="text-gold font-mono font-semibold">
                  {collectCurrency === 'USD' && pendingOrder.net_total_usd != null
                    ? fmtUsd(pendingOrder.net_total_usd)
                    : fmtArs(effectiveNetArs(pendingOrder))}
                </span>
              </div>
            </div>
            <div className="mb-5">
              <p className="text-xs text-cream/50 mb-2">¿En qué moneda cobraste?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCollectCurrency('ARS')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    collectCurrency === 'ARS'
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-gold/15 text-cream/50 hover:border-gold/30'
                  }`}
                >
                  Pesos (ARS)
                </button>
                <button
                  type="button"
                  onClick={() => setCollectCurrency('USD')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    collectCurrency === 'USD'
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-gold/15 text-cream/50 hover:border-gold/30'
                  }`}
                >
                  Dólares (USD)
                </button>
              </div>
            </div>
            {!(confirmPublicId && unlockedMembers[confirmPublicId]) && (
              <MemberPinGate
                members={members}
                memberId={collectMemberId}
                memberPin={collectMemberPin}
                onMemberIdChange={setCollectMemberId}
                onPinChange={setCollectMemberPin}
                label="¿Quién de tu equipo cobró? Necesitamos el PIN para confirmar."
              />
            )}
            <p className="text-xs text-cream/40 mb-5">
              El monto que le cobrás al pasajero lo definís vos. Al confirmar, la reserva pasa a <strong className="text-cream/60">Cobrada</strong> y se envía el email de confirmación al pasajero.
            </p>
            {collectError && (
              <p className="text-xs text-bordeaux-light mb-4">⚠ {collectError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setConfirmPublicId(null); setCollectError(null); }}
                className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
                disabled={collecting === confirmPublicId}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCollect(confirmPublicId)}
                disabled={collecting === confirmPublicId || (!(confirmPublicId && unlockedMembers[confirmPublicId]) && isMemberPinMissing(members, collectMemberId, collectMemberPin))}
                className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors disabled:opacity-60"
              >
                {collecting === confirmPublicId ? 'Procesando...' : 'Sí, cobré el dinero'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {cancelConfirmOrder && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-ink-soft border border-red-500/20 p-6 md:p-8 animate-modal-panel">
            <h2 className="font-display text-2xl text-cream mb-1">Cancelar reserva</h2>
            <p className="text-sm text-cream/50 mb-5">
              Esta acción no se puede deshacer. Se notificará al pasajero y al administrador.
            </p>
            <div className="rounded-lg border border-gold/15 bg-ink/40 p-4 space-y-1.5 mb-5 text-sm">
              <div className="flex justify-between">
                <span className="text-cream/50">Pasajero</span>
                <span className="text-cream font-medium">{cancelConfirmOrder.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Servicio</span>
                <span className="text-cream/80">{cancelConfirmOrder.option_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Fecha</span>
                <span className="text-cream/80">{fmtDate(cancelConfirmOrder.service_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/50">Sugerido</span>
                <span className="text-cream/70 font-mono">{fmtArs(cancelConfirmOrder.total_ars)}</span>
              </div>
            </div>
            <label className="block mb-4">
              <span className="text-xs text-cream/50 uppercase tracking-wider mb-1.5 block">
                Motivo (opcional — se incluye en el email al pasajero)
              </span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ej: El pasajero no se presentó, cambio de planes, etc."
                className="w-full rounded-lg border border-gold/20 bg-ink/60 px-3 py-2.5 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40 resize-none"
              />
            </label>
            {!unlockedMembers[cancelConfirmOrder.public_id] && !unlockedAdmin[cancelConfirmOrder.public_id] && (
              <div>
                <MemberPinGate
                  members={members}
                  memberId={cancelMemberId}
                  memberPin={cancelMemberPin}
                  onMemberIdChange={setCancelMemberId}
                  onPinChange={setCancelMemberPin}
                  label={cancelAdminOverride
                    ? 'PIN de administrador — autorizás vos porque la persona no está disponible.'
                    : '¿Quién sos? Necesitamos tu PIN para confirmar la cancelación.'}
                  pinPlaceholder={cancelAdminOverride ? 'PIN de administrador' : undefined}
                />
                {members.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setCancelAdminOverride((v) => !v); setCancelMemberPin(''); }}
                    className="-mt-3 mb-5 text-[10px] text-cream/40 hover:text-cream/70 transition underline underline-offset-2"
                  >
                    {cancelAdminOverride ? 'usar el PIN de la persona' : '¿la persona no está? usar PIN de administrador'}
                  </button>
                )}
              </div>
            )}
            {cancelError && (
              <p className="text-xs text-red-400 mb-4">⚠ {cancelError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setCancelConfirmOrder(null); setCancelError(null); }}
                className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
                disabled={cancelingOrder === cancelConfirmOrder.public_id}
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleCancelConfirm}
                disabled={cancelingOrder === cancelConfirmOrder.public_id || (!unlockedMembers[cancelConfirmOrder.public_id] && !unlockedAdmin[cancelConfirmOrder.public_id] && (cancelAdminOverride ? !/^\d{4,6}$/.test(cancelMemberPin) : isMemberPinMissing(members, cancelMemberId, cancelMemberPin)))}
                className="flex-1 rounded-lg bg-red-600/80 border border-red-500/50 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {cancelingOrder === cancelConfirmOrder.public_id ? 'Cancelando...' : 'Sí, cancelar reserva'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {addonPrompt && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-ink-soft border border-gold/20 p-6 animate-modal-panel">
            <h2 className="font-display text-xl text-cream mb-1">
              {addonPrompt.action === 'collect' ? 'Confirmar cobro de ampliación' : 'Cancelar ampliación'}
            </h2>
            <p className="text-sm text-cream/50 mb-5">
              Tu equipo está cargado — necesitamos identificar quién hace este cambio.
            </p>
            <MemberPinGate
              members={members}
              memberId={addonMemberId}
              memberPin={addonMemberPin}
              onMemberIdChange={setAddonMemberId}
              onPinChange={setAddonMemberPin}
            />
            {addonPromptError && (
              <p className="text-xs text-bordeaux-light mb-4">⚠ {addonPromptError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setAddonPrompt(null); setAddonPromptError(null); }}
                className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmAddonAction}
                disabled={isMemberPinMissing(members, addonMemberId, addonMemberPin)}
                className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors disabled:opacity-60"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    <div className="p-4 md:p-8 max-w-6xl">
      <header className="mb-4 md:mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl text-cream">Mis Órdenes</h1>
            <p className="mt-0.5 text-xs md:text-sm text-cream/50">Órdenes generadas con tu código</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect className="w-36 md:w-44" options={STATUS_FILTER_OPTIONS} value={filter} onChange={setFilter} />
          <DateRangePicker className="w-56" from={dateFrom} to={dateTo}
            onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
          {members.length > 0 && (
            <SimpleSelect className="w-44" options={memberFilterOptions} value={memberFilter} onChange={setMemberFilter} />
          )}
        </div>
      </header>

      {hasActiveFilters && !loading && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs md:text-sm">
          <span className="text-gold-soft">Filtros aplicados</span>
          <span className="text-cream/40">·</span>
          <span className="text-cream/50">{visible.length} resultado{visible.length !== 1 ? 's' : ''}</span>
          <button type="button" onClick={clearFilters}
            className="ml-auto text-xs text-gold-soft hover:text-gold transition underline underline-offset-2">
            Ver todas
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-8 text-center text-cream/40 text-sm">
          No hay ventas{filter ? ' con ese filtro' : ''} todavía.
        </div>
      ) : (
        <>
          {/* ── MOBILE: tarjetas ── */}
          <div className="md:hidden space-y-2">
            {visible.map((o) => {
              const isOpen = expanded === o.order_id;
              const isHighlighted = o.public_id === highlight;
              return (
                <div
                  key={o.order_id}
                  ref={isHighlighted ? highlightRowRef : null}
                  onClick={() => setExpanded(isOpen ? null : o.order_id)}
                  className={`rounded-xl border overflow-hidden cursor-pointer select-none transition
                    ${isOpen ? 'border-gold/30 bg-ink-soft/60' : 'border-gold/10 bg-ink-soft/30'}
                    ${isHighlighted ? 'ring-1 ring-gold/40' : ''}`}
                >
                  <div className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-cream text-sm font-medium leading-tight truncate">{o.product_name}</p>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs ${derivedStatus(o).cls}`}>
                          {derivedStatus(o).label}
                        </span>
                        {topExtraBadge(o, false) === 'reduced' && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-xs border border-sky-500/30 bg-sky-950/20 text-sky-300">↓ Reducida</span>
                        )}
                        {topExtraBadge(o, false) === 'restored' && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-xs border border-emerald-500/30 bg-emerald-950/20 text-emerald-300">↺ Restaurada</span>
                        )}
                      </div>
                      <p className="text-xs text-cream/70 truncate">{o.customer_name}</p>
                      <p className="text-xs text-cream/50 truncate">{o.option_name}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-cream/40">
                        <span>Serv. {fmtDate(o.service_date || o.created_at)}</span>
                        <span>·</span>
                        <span>{paxLabel(o.adults ?? 0, o.children ?? 0)}</span>
                        {o.payment_method === 'cash' && <span className="text-cream/30">· Efectivo</span>}
                        {members.length > 0 && o.seller_member_name && <span className="text-gold-soft/70">· {o.seller_member_name}</span>}
                      </div>
                      <p className="text-[10px] text-cream/30 mt-0.5">Ord. {fmtDateTime(o.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {o.payment_method === 'cash' ? (
                        (o.status === 'paid' || o.status === 'pending') && (
                          <>
                            <p className="text-cream font-mono text-sm">{netDisplay(o)}</p>
                            <p className="text-[10px] text-cream/40 -mt-0.5">neto a rendir</p>
                          </>
                        )
                      ) : (
                        <>
                          <p className="text-cream font-mono text-sm">{fmtArs(o.total_ars)}</p>
                          {(o.status === 'paid' || o.status === 'pending') && (
                            <p className="text-gold font-mono text-xs" title="Tu ganancia">{fmtArs(effectiveCommissionArs(o))}</p>
                          )}
                        </>
                      )}
                      <span className={`text-gold/50 text-xs inline-block mt-1 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-gold/10 px-4 py-3 bg-ink-soft/20 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Detalle</p>
                      <OrderMemberGate
                        members={members}
                        unlocked={unlockedMembers[o.public_id] ?? null}
                        onUnlock={(memberId, pin) => markUnlocked(o.public_id, memberId, pin)}
                        onRelock={() => relock(o.public_id)}
                        adminUnlocked={unlockedAdmin[o.public_id] ?? null}
                        onAdminUnlock={(pin) => markAdminUnlocked(o.public_id, pin)}
                        onAdminRelock={() => relockAdmin(o.public_id)}
                      />
                      <DetailRow label="Pasajero">{o.customer_name}</DetailRow>
                      <DetailRow label="Email">{o.customer_email}</DetailRow>
                      {o.customer_phone && <DetailRow label="Teléfono">{o.customer_phone}</DetailRow>}
                      {o.customer_nationality && <DetailRow label="Nac.">{o.customer_nationality}</DetailRow>}
                      <DetailRow label="Fecha servicio">{fmtDate(o.service_date)}</DetailRow>
                      {(() => {
                        const pd = paxDetail(o, eventsByOrder[o.public_id]);
                        return (
                          <>
                            <DetailRow label="Pasajeros">{pd.current}</DetailRow>
                            {pd.original && <DetailRow label="Antes"><span className="text-cream/50">{pd.original}</span></DetailRow>}
                            {pd.added && <DetailRow label="Sumados"><span className="text-gold text-xs">{pd.added}</span></DetailRow>}
                          </>
                        );
                      })()}
                      <DetailRow label="Pago">{PAYMENT_LABEL[o.payment_method] ?? o.payment_method}</DetailRow>
                      <AttributionPicker publicId={o.public_id} currentName={o.seller_member_name} members={members} paymentMethod={o.payment_method}
                        unlockedMember={unlockedMembers[o.public_id] ?? null}
                        onMemberValidated={(memberId, pin) => markUnlocked(o.public_id, memberId, pin)}
                        unlockedAdminPin={unlockedAdmin[o.public_id] ?? null}
                        onAdminValidated={(pin) => markAdminUnlocked(o.public_id, pin)}
                        onSaved={() => reload()} />
                      {o.payment_method !== 'cash' && (
                        <>
                          <DetailRow label="Total"><span className="text-cream font-mono">{fmtArs(o.total_ars)}</span></DetailRow>
                          {(o.status === 'paid' || o.status === 'pending') && (
                            <DetailRow label={o.status === 'paid' ? 'Tu ganancia' : 'Tu ganancia (estimada)'}>
                              <span className="text-gold font-mono">{fmtArs(effectiveCommissionArs(o))}</span>
                            </DetailRow>
                          )}
                        </>
                      )}
                      {o.payment_method === 'cash' ? (
                        <>
                          {(o.status === 'paid' || o.status === 'pending') && (
                            <DetailRow label="Neto a rendir"><span className="text-cream font-mono">{netDisplay(o)}</span></DetailRow>
                          )}
                          <DetailRow label="Neto rendido">
                            {o.net_settled_at
                              ? <span className="text-emerald-400">✓ {fmtDate(o.net_settled_at)}</span>
                              : o.status === 'paid'
                                ? <span className="text-amber-400">Pendiente</span>
                                : <span className="text-cream/30">—</span>}
                          </DetailRow>
                        </>
                      ) : (
                        <DetailRow label="Te liquidamos">
                          {o.paid_to_seller_at
                            ? <span className="text-emerald-400">✓ {fmtDate(o.paid_to_seller_at)}</span>
                            : o.status === 'paid'
                              ? <span className="text-amber-400">Pendiente</span>
                              : <span className="text-cream/30">—</span>}
                        </DetailRow>
                      )}
                      {o.status === 'pending' && o.payment_method !== 'cash' && (
                        <div className="mt-3 pt-3 border-t border-gold/10">
                          <p className="text-[10px] text-cream/40">
                            Le enviamos el link de pago al pasajero por email. Si no lo recibió, decile que nos escriba por WhatsApp.
                          </p>
                        </div>
                      )}
                      {o.payment_method === 'cash' && o.status === 'pending' && (
                        <div className="mt-3 pt-3 border-t border-gold/10">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openCollectModal(o.public_id); }}
                            className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
                          >
                            ✓ Confirmar cobro en efectivo
                          </button>
                        </div>
                      )}
                      {o.payment_method !== 'cash' && (o.status === 'pending' || o.status === 'paid') && (
                        <p className="mt-3 pt-3 border-t border-gold/10 text-[10px] text-cream/40">
                          Esta reserva es online (tarjeta o PIX): cualquier cambio o cancelación lo gestiona el administrador. El cliente puede contactarnos directamente.
                        </p>
                      )}
                      {o.payment_method === 'cash' && o.net_settled_at && (o.status === 'pending' || o.status === 'paid') && (
                        <p className="mt-3 pt-3 border-t border-gold/10 text-[10px] text-cream/40">
                          Esta reserva ya fue rendida al operador: no se puede modificar ni cancelar.
                        </p>
                      )}
                      {o.payment_method === 'cash' && !o.net_settled_at && (o.status === 'pending' || o.status === 'paid') && (() => {
                        const modBlocked = isWindowBlocked(modifyWindow, o.service_date);
                        return (
                          <div className="mt-3 pt-3 border-t border-gold/10 space-y-2">
                            {modBlocked && <p className="text-[10px] text-amber-400">{windowBlockMsg(modifyWindow)}</p>}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setModifyOrder(o); }}
                              disabled={modBlocked}
                              className="w-full rounded-lg border border-gold/25 px-4 py-2.5 text-sm text-gold-soft hover:bg-gold/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              ✎ Modificar pasajeros
                            </button>
                          </div>
                        );
                      })()}
                      {o.payment_method === 'cash' && !o.net_settled_at && (o.status === 'pending' || o.status === 'paid') && (() => {
                        const cancelBlocked = isWindowBlocked(cancelWindow, o.service_date);
                        return (
                          <div className="mt-2">
                            {cancelBlocked && <p className="text-[10px] text-amber-400 mb-1">{windowBlockMsg(cancelWindow)}</p>}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCancelOrder(o); }}
                              disabled={cancelBlocked || cancelingOrder === o.public_id}
                              className="w-full rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {cancelingOrder === o.public_id ? 'Cancelando...' : '✕ Cancelar reserva'}
                            </button>
                          </div>
                        );
                      })()}
                      {canArchiveManually(o) && (
                        <div className="mt-3 pt-3 border-t border-gold/10">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleArchiveOrder(o.public_id); }}
                            disabled={archivingOrder === o.public_id}
                            className="w-full rounded-lg border border-emerald-500/25 px-4 py-2.5 text-sm text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                          >
                            {archiveButtonLabel(o, archivingOrder === o.public_id)}
                          </button>
                        </div>
                      )}
                      {renderAddons(o)}
                      {eventsByOrder[o.public_id] && (
                        <div className="mt-3 pt-3 border-t border-gold/10">
                          <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Histórico</p>
                          <OrderHistory events={eventsByOrder[o.public_id]} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── DESKTOP: tabla ── */}
          <div className="hidden md:block rounded-xl border border-gold/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/10 text-cream/50 text-[10px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Fecha servicio</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Show / Opción</th>
                  <th className="text-left px-3 py-2">Pasajeros</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  {members.length > 0 && <th className="text-left px-3 py-2">Asignado</th>}
                  <th className="text-right px-3 py-2">Venta</th>
                  <th className="text-right px-3 py-2">Incentivo / Neto</th>
                  <th className="text-center px-3 py-2">Liquidado</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const isOpen = expanded === o.order_id;
                  const isHighlighted = o.public_id === highlight;
                  return (
                    <>
                      <tr
                        key={o.order_id}
                        ref={isHighlighted ? highlightRowRef : null}
                        onClick={() => setExpanded(isOpen ? null : o.order_id)}
                        className={`border-b border-gold/5 cursor-pointer select-none transition ${isOpen ? 'bg-gold/5' : 'hover:bg-ink-soft/30'} ${isHighlighted ? 'ring-1 ring-inset ring-gold/40' : ''}`}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          <p className="text-cream/70 text-[11px]">{fmtDate(o.service_date || o.created_at)}</p>
                          <p className="text-[10px] text-cream/35 mt-0.5">{fmtDateTime(o.created_at)}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-cream text-[11px] truncate max-w-[160px]">{o.customer_name}</p>
                          <p className="text-[10px] text-cream/40 truncate max-w-[160px]">{o.customer_email}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-cream text-[11px]">{o.product_name}</p>
                          <p className="text-[10px] text-cream/50">{o.option_name}</p>
                        </td>
                        <td className="px-3 py-2 text-cream/70 text-[11px] whitespace-nowrap">{paxLabel(o.adults ?? 0, o.children ?? 0)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap ${derivedStatus(o).cls}`}>
                              {derivedStatus(o).label}
                            </span>
                            {topExtraBadge(o, true) === 'manual' && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] border border-gold/30 bg-gold/5 text-gold-soft whitespace-nowrap">Manual</span>
                            )}
                            {topExtraBadge(o, true) === 'cash' && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] border border-cream/15 bg-cream/5 text-cream/40 whitespace-nowrap">Efectivo</span>
                            )}
                            {topExtraBadge(o, true) === 'reduced' && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] border border-sky-500/30 bg-sky-950/20 text-sky-300 whitespace-nowrap">↓ Reducida</span>
                            )}
                            {topExtraBadge(o, true) === 'restored' && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 whitespace-nowrap">↺ Restaurada</span>
                            )}
                          </div>
                        </td>
                        {members.length > 0 && (
                          <td className="px-3 py-2 text-[11px] text-cream/60 whitespace-nowrap max-w-[120px] truncate">
                            {o.seller_member_name ?? <span className="text-cream/25">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-[11px]">
                          {o.payment_method === 'cash'
                            ? <span className="text-cream/30">—</span>
                            : <span className="text-cream">{fmtArs(o.total_ars)}</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-[11px]">
                          {(o.status === 'paid' || o.status === 'pending')
                            ? (o.payment_method === 'cash'
                                ? <span className="text-cream/80">{netDisplay(o)}</span>
                                : <span className="text-gold">{fmtArs(effectiveCommissionArs(o))}</span>)
                            : <span className="text-cream/30">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center text-[11px]">
                          {(o.payment_method === 'cash' ? o.net_settled_at : o.paid_to_seller_at)
                            ? <span className="text-emerald-400">✓</span>
                            : o.status === 'paid'
                              ? <span className="text-amber-400">Pdte.</span>
                              : <span className="text-cream/30">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <span className={`text-gold/50 text-xs inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${o.order_id}-detail`} className="border-b border-gold/10 bg-ink-soft/20">
                          <td colSpan={members.length > 0 ? 10 : 9} className="px-5 py-4">
                            <OrderMemberGate
                              members={members}
                              unlocked={unlockedMembers[o.public_id] ?? null}
                              onUnlock={(memberId, pin) => markUnlocked(o.public_id, memberId, pin)}
                              onRelock={() => relock(o.public_id)}
                              adminUnlocked={unlockedAdmin[o.public_id] ?? null}
                              onAdminUnlock={(pin) => markAdminUnlocked(o.public_id, pin)}
                              onAdminRelock={() => relockAdmin(o.public_id)}
                            />
                            <div className="grid sm:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Pasajero</p>
                                <DetailRow label="Nombre">{o.customer_name}</DetailRow>
                                <DetailRow label="Email">{o.customer_email}</DetailRow>
                                {o.customer_phone && <DetailRow label="Teléfono">{o.customer_phone}</DetailRow>}
                                {o.customer_nationality && <DetailRow label="Nacionalidad">{o.customer_nationality}</DetailRow>}
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Reserva</p>
                                <DetailRow label="Show">{o.product_name}</DetailRow>
                                <DetailRow label="Opción">{o.option_name}</DetailRow>
                                <DetailRow label="Fecha">{fmtDate(o.service_date)}</DetailRow>
                                {(() => {
                                  const pd = paxDetail(o, eventsByOrder[o.public_id]);
                                  return (
                                    <>
                                      <DetailRow label="Pasajeros">{pd.current}</DetailRow>
                                      {pd.original && <DetailRow label="Antes"><span className="text-cream/50">{pd.original}</span></DetailRow>}
                                      {pd.added && <DetailRow label="Sumados"><span className="text-gold text-xs">{pd.added}</span></DetailRow>}
                                    </>
                                  );
                                })()}
                                <DetailRow label="Compra">{fmtDateTime(o.created_at)}</DetailRow>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Pago y liquidación</p>
                                <DetailRow label="Medio">{PAYMENT_LABEL[o.payment_method] ?? o.payment_method}</DetailRow>
                                <AttributionPicker publicId={o.public_id} currentName={o.seller_member_name} members={members} paymentMethod={o.payment_method}
                        unlockedMember={unlockedMembers[o.public_id] ?? null}
                        onMemberValidated={(memberId, pin) => markUnlocked(o.public_id, memberId, pin)}
                        unlockedAdminPin={unlockedAdmin[o.public_id] ?? null}
                        onAdminValidated={(pin) => markAdminUnlocked(o.public_id, pin)}
                        onSaved={() => reload()} />
                                {o.payment_method !== 'cash' && (
                                  <>
                                    <DetailRow label="Total"><span className="text-cream font-mono">{fmtArs(o.total_ars)}</span></DetailRow>
                                    {(o.status === 'paid' || o.status === 'pending') && (
                                      <DetailRow label={o.status === 'paid' ? 'Tu ganancia' : 'Tu ganancia (estimada)'}>
                                        <span className="text-gold font-mono">{fmtArs(effectiveCommissionArs(o))}</span>
                                      </DetailRow>
                                    )}
                                  </>
                                )}
                                {o.payment_method === 'cash' ? (
                                  <>
                                    {(o.status === 'paid' || o.status === 'pending') && (
                                      <DetailRow label="Neto a rendir"><span className="text-cream font-mono">{netDisplay(o)}</span></DetailRow>
                                    )}
                                    <DetailRow label="Neto rendido">
                                      {o.net_settled_at
                                        ? <span className="text-emerald-400">✓ {fmtDate(o.net_settled_at)}</span>
                                        : o.status === 'paid'
                                          ? <span className="text-amber-400">Pendiente</span>
                                          : <span className="text-cream/30">—</span>}
                                    </DetailRow>
                                  </>
                                ) : (
                                  <DetailRow label="Te liquidamos">
                                    {o.paid_to_seller_at
                                      ? <span className="text-emerald-400">✓ {fmtDate(o.paid_to_seller_at)}</span>
                                      : o.status === 'paid'
                                        ? <span className="text-amber-400">Pendiente</span>
                                        : <span className="text-cream/30">—</span>}
                                  </DetailRow>
                                )}
                                <DetailRow label="N° orden"><span className="font-mono text-cream/50">{o.public_id.slice(0, 12).toUpperCase()}</span></DetailRow>
                              </div>
                            </div>
                            {o.status === 'pending' && o.payment_method !== 'cash' && (
                              <div className="mt-4 pt-4 border-t border-gold/10 max-w-md">
                                <p className="text-xs text-cream/40">
                                  Le enviamos el link de pago al pasajero por email. Si no lo recibió, decile que nos escriba por WhatsApp.
                                </p>
                              </div>
                            )}
                            {o.payment_method === 'cash' && o.status === 'pending' && (
                              <div className="mt-4 pt-4 border-t border-gold/10">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openCollectModal(o.public_id); }}
                                  className="w-full rounded-lg bg-gold px-4 py-3 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
                                >
                                  ✓ Confirmar cobro en efectivo
                                </button>
                                <p className="mt-1.5 text-xs text-cream/35 text-center">Confirmar envía el email al pasajero</p>
                              </div>
                            )}
                            {o.payment_method !== 'cash' && (o.status === 'pending' || o.status === 'paid') && (
                              <p className="mt-4 pt-4 border-t border-gold/10 text-xs text-cream/40">
                                Esta reserva es online (tarjeta o PIX): cualquier cambio o cancelación lo gestiona el administrador. El cliente puede contactarnos directamente.
                              </p>
                            )}
                            {o.payment_method === 'cash' && o.net_settled_at && (o.status === 'pending' || o.status === 'paid') && (
                              <p className="mt-4 pt-4 border-t border-gold/10 text-xs text-cream/40">
                                Esta reserva ya fue rendida al operador: no se puede modificar ni cancelar.
                              </p>
                            )}
                            {o.payment_method === 'cash' && !o.net_settled_at && (o.status === 'pending' || o.status === 'paid') && (() => {
                              const modBlocked = isWindowBlocked(modifyWindow, o.service_date);
                              return (
                                <div className="mt-4 pt-4 border-t border-gold/10">
                                  {modBlocked && <p className="text-xs text-amber-400 mb-2">{windowBlockMsg(modifyWindow)}</p>}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setModifyOrder(o); }}
                                    disabled={modBlocked}
                                    className="w-full rounded-lg border border-gold/25 px-4 py-2.5 text-sm text-gold-soft hover:bg-gold/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    ✎ Modificar pasajeros / traslado
                                  </button>
                                  <p className="mt-1.5 text-xs text-cream/35 text-center">
                                    Sumás/bajás pax y cobrás o devolvés en el momento
                                  </p>
                                </div>
                              );
                            })()}
                            {o.payment_method === 'cash' && !o.net_settled_at && (o.status === 'pending' || o.status === 'paid') && (() => {
                              const cancelBlocked = isWindowBlocked(cancelWindow, o.service_date);
                              return (
                                <div className="mt-3 pt-3 border-t border-gold/10">
                                  {cancelBlocked && <p className="text-xs text-amber-400 mb-2">{windowBlockMsg(cancelWindow)}</p>}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleCancelOrder(o); }}
                                    disabled={cancelBlocked || cancelingOrder === o.public_id}
                                    className="w-full rounded-lg border border-red-500/30 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {cancelingOrder === o.public_id ? 'Cancelando...' : '✕ Cancelar reserva'}
                                  </button>
                                </div>
                              );
                            })()}
                            {canArchiveManually(o) && (
                              <div className="mt-4 pt-4 border-t border-gold/10 max-w-md">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleArchiveOrder(o.public_id); }}
                                  disabled={archivingOrder === o.public_id}
                                  className="w-full rounded-lg border border-emerald-500/25 px-4 py-2.5 text-sm text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                                >
                                  {archiveButtonLabel(o, archivingOrder === o.public_id)}
                                </button>
                              </div>
                            )}
                            <div className="max-w-md">{renderAddons(o)}</div>
                            {eventsByOrder[o.public_id] && (
                              <div className="mt-4 pt-4 border-t border-gold/10 max-w-md">
                                <p className="text-[10px] uppercase tracking-wider text-gold-soft mb-2">Histórico de la orden</p>
                                <OrderHistory events={eventsByOrder[o.public_id]} />
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && visible.length > 0 && (
        <p className="mt-3 text-xs text-cream/30 text-right">
          {visible.length} resultado{visible.length !== 1 ? 's' : ''} · Tocá para ver el detalle
        </p>
      )}
    </div>
    </>
  );
}
