import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, AdminApiError, type PendingAddon } from '../../lib/adminApi';

function isWindowBlocked(hours: number | null, serviceDate: string | undefined): boolean {
  if (!hours || !serviceDate) return false;
  const [y, m, d] = serviceDate.split('-').map(Number);
  const serviceMidnightUtcMs = Date.UTC(y, m - 1, d, 3, 0, 0); // medianoche BsAs = 03:00 UTC
  const hoursUntilService = (serviceMidnightUtcMs - Date.now()) / (60 * 60 * 1000);
  return hoursUntilService < hours;
}

function windowBlockMsg(hours: number | null): string {
  return `Se requieren al menos ${hours} hs de anticipación al servicio para esta operación.`;
}
import ConfirmDialog from '../../components/ConfirmDialog';
import ModifyReservationModal from '../../components/admin/ModifyReservationModal';
import PaymentLinkShare from '../../components/PaymentLinkShare';
import OrderHistory from '../../components/OrderHistory';
import Checkbox from '../../components/Checkbox';

interface OrderFull {
  id: number;
  public_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  customer_dni: string | null;
  total_usd: number;
  total_ars: number;
  exchange_rate_used: string;
  ref_code: string | null;
  mp_payment_id: string | null;
  mp_payment_status: string | null;
  mp_payment_method: string | null;
  mp_init_point: string | null;
  payment_method: 'mercadopago' | 'cash' | 'pix';
  cash_collected_currency: 'ARS' | 'USD' | null;
  internal_notes: string | null;
  paid_at: string | null;
  created_at: string;
  seller_id: number | null;
  seller_code: string | null;
  seller_name: string | null;
  commission_percent_snapshot: string | null;
  commission_amount_usd: number | null;
  commission_amount_ars: number | null;
  net_total_usd: number | null;
  paid_to_seller_at: string | null;
  net_settled_at: string | null;
  items: Array<{
    id: number;
    product_name_snapshot: string;
    option_name_snapshot: string;
    option_id: number;
    service_date: string;
    adults: number;
    children: number;
    unit_price_adult_usd: string;
    unit_price_child_usd: string | null;
    subtotal_usd: string;
    transfer_requested: boolean;
    transfer_hotel: string | null;
    transfer_room: string | null;
  }>;
  events: Array<{
    id: number;
    event_type: string;
    mp_resource_id: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
  }>;
}

export default function OrderDetail() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderFull | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [note, setNote] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('No pudimos confirmar disponibilidad con la casa de tango para esa fecha.');
  const [refundNotify, setRefundNotify] = useState(true);
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [refundMode, setRefundMode] = useState<'total' | 'partial'>('total');
  const [refundAmount, setRefundAmount] = useState('');
  const [liquidating, setLiquidating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [addons, setAddons] = useState<PendingAddon[]>([]);
  const [addonBusy, setAddonBusy] = useState<string | null>(null);
  const [collectingCash, setCollectingCash] = useState(false);
  const [modifyWindow, setModifyWindow] = useState<number | null>(null);
  const [cancelWindow, setCancelWindow] = useState<number | null>(null);

  const load = async () => {
    if (!publicId) return;
    try {
      const [data, mw, cw] = await Promise.all([
        adminApi.orders.get(publicId),
        adminApi.settings.getModifyWindow(),
        adminApi.settings.getCancelWindow(),
      ]);
      setOrder(data as unknown as OrderFull);
      setNewStatus((data as unknown as OrderFull).status);
      setModifyWindow(mw.hours);
      setCancelWindow(cw.hours);
      adminApi.orders.addons(publicId).then(setAddons).catch(() => {});
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  const handleCollectCash = async (currency: 'ARS' | 'USD') => {
    if (!order || !publicId) return;
    const currencyLabel = currency === 'USD' ? 'dólares' : 'pesos';
    if (!confirm(`¿Confirmar que se cobró en efectivo (en ${currencyLabel}) la orden de ${order.customer_name}?\n\nSugerido: ARS ${order.total_ars.toLocaleString('es-AR')} (el monto lo define el vendedor)\n\nQuedará registrado como cobrado por el admin.`)) return;
    try {
      setCollectingCash(true);
      await adminApi.orders.collectCash(publicId, currency);
      await load();
    } catch (err) {
      alert(`Error al confirmar cobro: ${(err as AdminApiError).message}`);
    } finally {
      setCollectingCash(false);
    }
  };

  const handleCollectAddon = async (addonPublicId: string) => {
    if (!confirm('¿Confirmás que cobraste el dinero de esta ampliación en efectivo?')) return;
    setAddonBusy(addonPublicId);
    try {
      await adminApi.orders.collectAddon(addonPublicId);
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setAddonBusy(null);
    }
  };

  const handleCancelAddon = async (addonPublicId: string) => {
    if (!confirm('¿Cancelar esta ampliación pendiente? Se libera el cupo reservado.')) return;
    setAddonBusy(addonPublicId);
    try {
      await adminApi.orders.cancelAddon(addonPublicId);
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setAddonBusy(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  const handleStatusUpdate = async () => {
    if (!order || !publicId || newStatus === order.status) return;
    if (!confirm(`¿Cambiar estado de "${order.status}" a "${newStatus}"?`)) return;
    try {
      await adminApi.orders.updateStatus(publicId, newStatus, note || undefined);
      setNote('');
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  const handleSyncMp = async () => {
    if (!publicId) return;
    try {
      setSyncing(true);
      const r = await adminApi.orders.syncMp(publicId);
      await load();
      alert(`✓ Sincronizado con Mercado Pago.\nEstado de la orden: ${r.status}.`);
    } catch (err) {
      alert(`No se pudo sincronizar: ${(err as AdminApiError).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkCommissionPaid = async () => {
    if (!order || !order.seller_id) return;
    const confirm1 = confirm(
      `¿Marcar la comisión de esta orden como liquidada al vendedor?\n\nVendedor: ${order.seller_name}\nComisión: ${fmtArs(order.commission_amount_ars ?? 0)}\n\nSe notificará al vendedor automáticamente.`,
    );
    if (!confirm1) return;
    try {
      setLiquidating(true);
      await adminApi.sellers.markCommissionsPaid(order.seller_id, [order.id]);
      await load();
    } catch (err) {
      alert(`Error al marcar liquidación: ${(err as AdminApiError).message}`);
    } finally {
      setLiquidating(false);
    }
  };

  const handleMarkNetSettled = async () => {
    if (!order || !order.seller_id) return;
    const confirm1 = confirm(
      `¿Confirmar que ${order.seller_name} ya nos liquidó el neto de esta venta en efectivo?\n\nNeto: ${fmtArs((order.net_total_usd ?? 0) * Number(order.exchange_rate_used))}\n\nQueda registrado con fecha.`,
    );
    if (!confirm1) return;
    try {
      setLiquidating(true);
      await adminApi.sellers.markNetSettled(order.seller_id, [order.id]);
      await load();
    } catch (err) {
      alert(`Error al marcar el neto como cobrado: ${(err as AdminApiError).message}`);
    } finally {
      setLiquidating(false);
    }
  };

  const handleRefund = async () => {
    if (!order || !publicId) return;
    let amount_usd: number | undefined;
    if (refundMode === 'partial') {
      const n = Number(refundAmount);
      if (!Number.isFinite(n) || n <= 0) {
        alert('Ingresá un monto válido a reintegrar.');
        return;
      }
      if (n > order.total_usd) {
        alert(`El monto no puede superar el total de la orden (USD ${order.total_usd}).`);
        return;
      }
      if (n === order.total_usd) {
        // Si el parcial coincide con el total, lo tratamos como total para consistencia
        amount_usd = undefined;
      } else {
        amount_usd = n;
      }
    }
    try {
      setRefundProcessing(true);
      const result = await adminApi.orders.refund(publicId, {
        reason: refundReason.trim() || undefined,
        notify_customer: refundNotify,
        amount_usd,
      });
      const msg = result.is_partial
        ? `✓ Reintegro PARCIAL procesado en Mercado Pago.\nMonto: USD ${result.amount_usd}\n${result.refund_id ? `Refund ID: ${result.refund_id}\n` : ''}La orden sigue como "Pagada".\nEl cliente verá el crédito en 2-5 días hábiles.`
        : `✓ Reintegro TOTAL procesado en Mercado Pago.\nMonto: USD ${result.amount_usd}\n${result.refund_id ? `Refund ID: ${result.refund_id}\n` : ''}La orden pasó a "Reintegrada".\nEl cliente verá el crédito en 2-5 días hábiles.`;
      alert(msg + (refundNotify ? '\n\nSe enviaron emails de notificación.' : ''));
      setRefundOpen(false);
      setRefundMode('total');
      setRefundAmount('');
      await load();
    } catch (err) {
      alert(`Error al procesar reintegro: ${(err as AdminApiError).message}`);
    } finally {
      setRefundProcessing(false);
    }
  };

  const runDelete = async () => {
    if (!publicId) return;
    setDeleting(true);
    try {
      await adminApi.orders.archive(publicId);
      navigate('/admin/orders');
    } catch (err) {
      setError((err as AdminApiError).message);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (error) return <div className="p-8"><div className="text-bordeaux-light">{error}</div></div>;
  if (!order) return <div className="p-8"><div className="h-32 rounded bg-ink-soft/60 animate-pulse" /></div>;

  return (
    <div className="p-8 max-w-5xl">
      <Link to={`/admin/orders?highlight=${publicId}`} className="text-sm text-gold-soft hover:text-gold">← Volver al listado</Link>

      <header className="mt-3 mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Orden</p>
        <h1 className="mt-1 font-display text-3xl text-cream font-mono break-all">{order.public_id}</h1>
        <p className="mt-1 text-sm text-cream/50">Creada el {new Date(order.created_at).toLocaleString()}</p>
      </header>

      {/* Acceso destacado al reintegro — acción crítica para cancelaciones sin cupo */}
      {order.status === 'paid' && order.payment_method === 'mercadopago' && (() => {
        const serviceDate = order.items[0]?.service_date;
        const blocked = isWindowBlocked(cancelWindow, serviceDate);
        return (
          <div className="mb-8 rounded-xl border-2 border-bordeaux-light/50 bg-bordeaux-deep/20 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-bordeaux-light">Sin cupo / cancelación</p>
              <p className="mt-1 font-display text-xl text-cream">Reintegrar el dinero al cliente</p>
              <p className="mt-1 text-sm text-cream/70">
                Devolvé el monto al medio de pago original de forma segura (total o parcial).
                Total pagado: <strong className="text-cream">USD {order.total_usd}</strong>.
              </p>
              {blocked && <p className="mt-2 text-xs text-amber-400">{windowBlockMsg(cancelWindow)}</p>}
            </div>
            <button
              type="button"
              onClick={() => setRefundOpen(true)}
              disabled={blocked}
              title={blocked ? windowBlockMsg(cancelWindow) : undefined}
              className="btn-primary shrink-0 bg-bordeaux-light hover:bg-bordeaux-light/90 focus:ring-bordeaux-light/40 px-6 py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↩ Reintegrar al cliente
            </button>
          </div>
        );
      })()}

      {/* PIX: los reintegros no son automáticos (Nautt no expone refund) — se hacen a mano. */}
      {order.status === 'paid' && order.payment_method === 'pix' && (
        <div className="mb-8 rounded-xl border border-[#32BCAD]/40 bg-[#32BCAD]/5 p-5 text-sm">
          <p className="text-xs uppercase tracking-widest text-[#5fd9cb]">Pago con PIX (reales)</p>
          <p className="mt-1 text-cream/70">
            Los reintegros de PIX <strong className="text-cream/90">no se procesan automáticamente</strong>. Para devolver el
            dinero, hacé la transferencia PIX manualmente desde el panel de Nautt a la clave del cliente y dejá constancia acá.
          </p>
        </div>
      )}

      {order.status === 'pending' && order.payment_method === 'cash' && (
        <div className="mb-8 rounded-xl border-2 border-emerald-500/50 bg-emerald-950/20 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400">Cobro en efectivo pendiente</p>
            <p className="mt-1 font-display text-xl text-cream">Confirmar cobro en nombre del vendedor</p>
            <p className="mt-1 text-sm text-cream/70">
              El vendedor no pudo operar el portal. Confirmá que el dinero fue recibido en efectivo.
              Sugerido: <strong className="text-cream">ARS {order.total_ars.toLocaleString('es-AR')}</strong> <span className="text-cream/50">(el monto lo define el vendedor)</span>.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCollectCash('ARS')}
              disabled={collectingCash}
              className="btn-primary bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500/40 px-5 py-3 text-sm disabled:opacity-50"
            >
              {collectingCash ? 'Guardando...' : '✓ Cobrado en pesos'}
            </button>
            <button
              type="button"
              onClick={() => handleCollectCash('USD')}
              disabled={collectingCash}
              className="btn-primary bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500/40 px-5 py-3 text-sm disabled:opacity-50"
            >
              {collectingCash ? 'Guardando...' : '✓ Cobrado en dólares'}
            </button>
          </div>
        </div>
      )}

      {order.status === 'refunded' && (
        <div className="mb-8 rounded-xl border border-gold/25 bg-gold/5 p-4 text-sm text-cream/80">
          ✓ Esta orden ya fue <strong className="text-gold">reintegrada</strong>. El cliente recibió el crédito en su medio de pago original.
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-6">
          <Section title="Cliente" twoColumn>
            <Row label="Nombre">{order.customer_name}</Row>
            <Row label="Email">{order.customer_email}</Row>
            <Row label="Teléfono">{order.customer_phone ?? '—'}</Row>
            <Row label="Nacionalidad">{order.customer_nationality ?? '—'}</Row>
            {order.customer_dni && <Row label="DNI / Pasaporte">{order.customer_dni}</Row>}
          </Section>

          {order.items.map((item) => (
            <Section key={item.id} title="Servicio" twoColumn>
              <Row label="Producto">{item.product_name_snapshot}</Row>
              <Row label="Tier">{item.option_name_snapshot}</Row>
              <Row label="Fecha del servicio">{item.service_date}</Row>
              <Row label="Adultos">{item.adults} × USD {item.unit_price_adult_usd}</Row>
              {item.children > 0 && (
                <Row label="Menores">{item.children} × USD {item.unit_price_child_usd ?? 0}</Row>
              )}
              <Row label="Subtotal" highlight full>USD {item.subtotal_usd}</Row>
              {item.transfer_requested && (
                <>
                  <Row label="Traslado">Sí</Row>
                  {item.transfer_hotel && <Row label="Hotel">{item.transfer_hotel}</Row>}
                  {item.transfer_room && <Row label="Habitación">{item.transfer_room}</Row>}
                </>
              )}
            </Section>
          ))}

          <Section title={order.payment_method === 'pix' ? 'PIX (Nautt)' : 'Mercado Pago'} twoColumn>
            <Row label={order.payment_method === 'pix' ? 'Orden Nautt' : 'Payment ID'}>{order.mp_payment_id ?? '—'}</Row>
            <Row label="Estado">{order.mp_payment_status ?? '—'}</Row>
            <Row label="Método">{order.mp_payment_method ?? '—'}</Row>
          </Section>

          {order.events.length > 0 && (
            <Section title="Histórico de la orden">
              <OrderHistory events={order.events} />
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-gold/20 bg-ink-soft/70 p-5">
            <p className="text-xs uppercase tracking-widest text-gold-soft">Estado</p>
            <StatusBadge status={order.status} large />
            <div className="mt-4 space-y-2">
              <Row label={order.payment_method === 'cash' ? 'Sugerido USD' : 'Total USD'} highlight>USD {order.total_usd}</Row>
              <Row label={order.payment_method === 'cash' ? 'Sugerido ARS' : 'Total ARS'}>ARS {order.total_ars.toLocaleString('es-AR')}</Row>
              {order.payment_method === 'cash' && (
                <p className="text-[11px] text-cream/40 leading-snug">Referencia — el vendedor le cobra al pasajero el monto que define; no lo registramos.</p>
              )}
              <Row label="Tipo de cambio">{Number(order.exchange_rate_used).toFixed(2)}</Row>
              {order.paid_at && <Row label="Pagada">{new Date(order.paid_at).toLocaleString()}</Row>}
            </div>
          </div>

          {/* Modificar reserva: reducir (reintegro/devolución) o agregar (cobro/link).
              PIX queda afuera: no hay refund ni link incremental automático para reales. */}
          {order.status === 'paid' && order.items.length > 0 && order.payment_method !== 'pix' && !(order.payment_method === 'cash' && order.net_settled_at) && (() => {
            const serviceDate = order.items[0]?.service_date;
            const blocked = isWindowBlocked(modifyWindow, serviceDate);
            return (
              <div className="rounded-lg border border-gold/20 bg-ink-soft/70 p-5">
                <p className="text-xs uppercase tracking-widest text-gold-soft">Modificar reserva</p>
                <p className="mt-2 text-sm text-cream/60">
                  Sumá o bajá pasajeros / traslado. {order.payment_method === 'mercadopago'
                    ? 'Reducir reintegra por MP; agregar genera un link para el cliente.'
                    : 'En efectivo: el vendedor devuelve o cobra la diferencia en el momento.'}
                </p>
                {blocked && <p className="mt-2 text-xs text-amber-400">{windowBlockMsg(modifyWindow)}</p>}
                <button type="button" onClick={() => setModifyOpen(true)}
                  disabled={blocked}
                  title={blocked ? windowBlockMsg(modifyWindow) : undefined}
                  className="btn-ghost w-full text-sm mt-4 disabled:opacity-40 disabled:cursor-not-allowed">
                  ✎ Modificar pasajeros / traslado
                </button>
              </div>
            );
          })()}

          {addons.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-5 space-y-4">
              <p className="text-xs uppercase tracking-widest text-amber-400">Ampliaciones pendientes</p>
              {addons.map((ad) => (
                <div key={ad.public_id} className="rounded-md border border-gold/10 bg-ink/30 p-3">
                  <p className="text-sm text-cream/90">
                    +{ad.extra_adults} ad{ad.extra_children > 0 ? ` · +${ad.extra_children} men` : ''} —
                    <strong className="text-gold"> {fmtArs(ad.charge_ars)}</strong>
                    <span className="text-cream/40 text-xs"> · {ad.payment_method === 'cash' ? 'Efectivo' : 'Mercado Pago'}</span>
                  </p>
                  {ad.payment_method === 'cash' ? (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => handleCollectAddon(ad.public_id)} disabled={addonBusy === ad.public_id}
                        className="flex-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-40">
                        {addonBusy === ad.public_id ? '...' : '✓ Confirmar cobro'}
                      </button>
                      <button type="button" onClick={() => handleCancelAddon(ad.public_id)} disabled={addonBusy === ad.public_id}
                        className="rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-40">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-cream/50">Esperando el pago del pasajero.</p>
                      {ad.mp_init_point && (
                        <PaymentLinkShare
                          link={ad.mp_init_point}
                          phone={order.customer_phone}
                          waMessage={`Hola ${order.customer_name}, para sumar pasajeros a tu reserva pagá la diferencia (${fmtArs(ad.charge_ars)}) acá: ${ad.mp_init_point}`}
                        />
                      )}
                      <button type="button" onClick={() => handleCancelAddon(ad.public_id)} disabled={addonBusy === ad.public_id}
                        className="w-full rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-40">
                        Cancelar ampliación
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {order.seller_name ? (
            <div className="rounded-lg border border-gold/20 bg-gold/5 p-5">
              <p className="text-xs uppercase tracking-widest text-gold-soft">Atribución</p>
              <Link to={`/admin/sellers/${order.seller_id}`} className="block mt-1 font-display text-xl text-cream hover:text-gold">
                {order.seller_name}
              </Link>
              <p className="text-xs text-gold-soft font-mono">{order.seller_code}</p>

              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cream/15 px-2.5 py-0.5 text-[11px] text-cream/70">
                {order.payment_method === 'cash' ? 'Pago en efectivo' : order.payment_method === 'pix' ? 'Pago por PIX (reales)' : 'Pago por Mercado Pago'}
              </div>

              {order.payment_method === 'cash' ? (
                <>
                  {/* Efectivo: no trazamos cuánto cobró el vendedor; solo nos rinde el neto */}
                  <div className="mt-3 space-y-1.5">
                    <Row label="Nos rinde (neto)" highlight>{cashNetDisplay(order)}</Row>
                    {order.cash_collected_currency && (
                      <Row label="Moneda cobrada">
                        {order.cash_collected_currency === 'USD' ? 'Dólares (USD)' : 'Pesos (ARS)'}
                      </Row>
                    )}
                  </div>
                  <p className="mt-3 rounded-md bg-ink/40 px-3 py-2 text-xs text-cream/70">
                    ➜ El vendedor le cobra al pasajero el monto que define (no lo registramos) y <strong>nos rinde el neto ({cashNetDisplay(order)})</strong>.
                  </p>
                  <div className="mt-2">
                    <Row label="Neto cobrado">
                      {order.net_settled_at
                        ? <span className="text-emerald-400">✓ {new Date(order.net_settled_at).toLocaleDateString()}</span>
                        : <span className="text-bordeaux-light">Pendiente de cobro</span>}
                    </Row>
                  </div>
                  {order.status === 'paid' && !order.net_settled_at && order.net_total_usd != null && (
                    <button
                      type="button"
                      onClick={handleMarkNetSettled}
                      disabled={liquidating}
                      className="mt-4 w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-40"
                    >
                      {liquidating ? 'Guardando...' : '✓ Marcar neto cobrado'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Mercado Pago: nosotros cobramos y le liquidamos su comisión */}
                  <div className="mt-3 space-y-1.5">
                    <Row label="Venta total">{fmtArs(order.total_ars)}</Row>
                    <Row label="Comisión">{Number(order.commission_percent_snapshot ?? 0).toFixed(1)}%</Row>
                    <Row label="Le liquidamos" highlight>{fmtArs(order.commission_amount_ars ?? 0)}</Row>
                  </div>
                  <p className="mt-3 rounded-md bg-ink/40 px-3 py-2 text-xs text-cream/70">
                    ➜ Cobramos por Mercado Pago y <strong>le liquidamos su comisión ({fmtArs(order.commission_amount_ars ?? 0)})</strong> al vendedor.
                  </p>
                  <div className="mt-2">
                    <Row label="Pago al vendedor">
                      {order.paid_to_seller_at
                        ? <span className="text-gold-soft">✓ {new Date(order.paid_to_seller_at).toLocaleDateString()}</span>
                        : <span className="text-bordeaux-light">Pendiente</span>}
                    </Row>
                  </div>
                  {order.status === 'paid' && !order.paid_to_seller_at && order.commission_amount_usd != null && (
                    <button
                      type="button"
                      onClick={handleMarkCommissionPaid}
                      disabled={liquidating}
                      className="mt-4 w-full rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold-soft hover:bg-gold/20 transition disabled:opacity-40"
                    >
                      {liquidating ? 'Guardando...' : '✓ Marcar como liquidado'}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-cream/10 bg-ink-soft/40 p-5">
              <p className="text-xs uppercase tracking-widest text-cream/40">Atribución</p>
              <p className="mt-2 text-sm text-cream/50">Sin vendedor atribuido</p>
              {order.ref_code && (
                <p className="mt-1 text-xs text-cream/40">Ref: <span className="font-mono">{order.ref_code}</span></p>
              )}
            </div>
          )}

          {order.status === 'pending' && order.payment_method === 'mercadopago' && order.mp_init_point && (
            <div className="rounded-lg border border-gold/20 bg-ink-soft/70 p-5">
              <p className="text-xs uppercase tracking-widest text-gold-soft mb-3">Link de pago (re-compartir)</p>
              <p className="text-sm text-cream/60 mb-3">La reserva está pendiente de pago. Reenviale el link al pasajero.</p>
              <PaymentLinkShare
                link={order.mp_init_point}
                phone={order.customer_phone}
                waMessage={`Hola ${order.customer_name}, te dejo el link para pagar tu reserva. Total USD ${order.total_usd}. Pagá acá: ${order.mp_init_point}`}
              />
            </div>
          )}

          {order.payment_method === 'mercadopago' && (order.status === 'pending' || (order.status === 'paid' && !order.mp_payment_id)) && (
            <div className="rounded-lg border border-gold/25 bg-gold/5 p-5">
              <p className="text-xs uppercase tracking-widest text-gold-soft">Sincronizar con Mercado Pago</p>
              <p className="mt-2 text-sm text-cream/70">
                {order.status === 'pending'
                  ? 'Consultá el estado real del pago en MP (por si el webhook no llegó). Si el cobro se aprobó, la orden pasa a Pagada y se envía el email al cliente.'
                  : 'Esta orden figura pagada pero sin ID de pago de MP. Sincronizá para recuperar el pago y poder reintegrar.'}
              </p>
              <button type="button" onClick={handleSyncMp} disabled={syncing}
                className="btn-primary w-full text-sm mt-4 disabled:opacity-50"
              >
                {syncing ? 'Sincronizando...' : '↻ Sincronizar con Mercado Pago'}
              </button>
            </div>
          )}

          <div className="rounded-lg border border-gold/10 bg-ink-soft/40 p-5">
            <p className="text-xs uppercase tracking-widest text-gold-soft mb-3">Cambiar estado manual</p>
            <p className="text-xs text-cream/40 mb-3">Para casos especiales (cancelaciones sin reintegro, marcar como pagada fuera de MP, etc.)</p>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="input mb-2">
              <option value="pending">Pendiente</option>
              <option value="paid">Pagada</option>
              <option value="failed">Fallida</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <p className="text-[10px] text-cream/40 mb-2">
              Para "Reintegrada" usá el botón <strong>"Cancelar y reintegrar"</strong>: solo así se procesa el refund real en Mercado Pago.
            </p>
            <input type="text" placeholder="Nota interna (opcional)" maxLength={500}
              value={note} onChange={(e) => setNote(e.target.value)}
              className="input mb-3"
            />
            <button type="button" onClick={handleStatusUpdate} disabled={newStatus === order.status}
              className="btn-ghost w-full text-sm disabled:opacity-40"
            >
              Aplicar cambio manual
            </button>
          </div>

          {order.internal_notes && (
            <div className="rounded-lg border border-gold/10 bg-ink-soft/40 p-5">
              <p className="text-xs uppercase tracking-widest text-gold-soft">Notas internas</p>
              <p className="mt-2 text-sm text-cream/80 whitespace-pre-wrap">{order.internal_notes}</p>
            </div>
          )}

          {/* Archivar orden */}
          <div className="rounded-lg border border-gold/15 bg-ink-soft/30 p-5">
            <p className="text-xs uppercase tracking-widest text-gold-soft">Archivar orden</p>
            <p className="mt-2 text-sm text-cream/60">
              Mueve esta orden al archivo. Desaparece del panel activo pero nunca se borra — podés restaurarla cuando quieras desde el archivo.
            </p>
            <button type="button" onClick={() => setDeleteOpen(true)}
              className="mt-4 w-full rounded-md border border-gold/25 px-3 py-2 text-sm text-cream/60 hover:bg-gold/10 hover:text-cream transition"
            >
              Archivar orden
            </button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Archivar orden"
        message={
          <>
            <p>La orden <strong className="text-cream font-mono break-all">{order.public_id}</strong> de <strong className="text-cream">{order.customer_name}</strong> (USD {order.total_usd}) pasará al archivo.</p>
            <p>Podés restaurarla en cualquier momento desde el archivo de órdenes.</p>
          </>
        }
        confirmLabel="Archivar"
        requireText="ARCHIVAR"
        loading={deleting}
        onConfirm={runDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* Modal de modificación de reserva */}
      {modifyOpen && order.items[0] && (
        <ModifyReservationModal
          order={{
            public_id: order.public_id,
            payment_method: order.payment_method,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            total_usd: order.total_usd,
            total_ars: order.total_ars,
          }}
          item={order.items[0]}
          handlers={{
            reduceMp: (body) => adminApi.orders.modifyMp(order.public_id, body),
            reduceCash: (body) => adminApi.orders.reduceCash(order.public_id, body),
            increaseCash: (body) => adminApi.orders.increaseCash(order.public_id, body),
            addMp: (body) => adminApi.orders.addMp(order.public_id, body),
            reschedule: (body) => adminApi.orders.reschedule(order.public_id, body),
          }}
          onClose={() => setModifyOpen(false)}
          onDone={() => { setModifyOpen(false); load(); }}
        />
      )}

      {/* Modal de confirmación de refund */}
      {refundOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/85 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-ink-soft border border-bordeaux-light/40 my-8">
            <header className="p-6 border-b border-gold/10">
              <p className="text-xs uppercase tracking-[0.3em] text-bordeaux-light">Reintegro vía Mercado Pago</p>
              <h2 className="mt-2 font-display text-2xl text-cream">Reintegrar reserva</h2>
              <p className="mt-2 text-sm text-cream/60">
                Total de la orden: <strong className="text-cream">USD {order.total_usd}</strong> · <span className="text-cream/40">ARS {order.total_ars.toLocaleString('es-AR')}</span>
              </p>
            </header>

            <div className="p-6 space-y-4">
              {/* Selector total / por pasajeros-traslado / monto manual */}
              <div>
                <span className="block text-sm text-cream/80 mb-2">Monto a reintegrar</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button type="button"
                    onClick={() => setRefundMode('total')}
                    className={`px-3 py-2 rounded-md border text-sm transition ${
                      refundMode === 'total'
                        ? 'border-bordeaux-light bg-bordeaux-deep/30 text-cream'
                        : 'border-gold/15 bg-ink/40 text-cream/60 hover:border-gold/30'
                    }`}
                  >
                    Total (USD {order.total_usd})
                  </button>
                  <button type="button"
                    onClick={() => { setRefundOpen(false); setModifyOpen(true); }}
                    className="px-3 py-2 rounded-md border text-sm transition border-gold/15 bg-ink/40 text-cream/60 hover:border-gold/30"
                  >
                    Por pasajeros / traslado
                  </button>
                  <button type="button"
                    onClick={() => setRefundMode('partial')}
                    className={`px-3 py-2 rounded-md border text-sm transition ${
                      refundMode === 'partial'
                        ? 'border-bordeaux-light bg-bordeaux-deep/30 text-cream'
                        : 'border-gold/15 bg-ink/40 text-cream/60 hover:border-gold/30'
                    }`}
                  >
                    Monto manual
                  </button>
                </div>
                <p className="mt-2 text-xs text-cream/40">
                  "Por pasajeros / traslado" calcula el monto automáticamente según cuánto saques y actualiza la reserva y el email con el detalle nuevo.
                </p>
              </div>

              {refundMode === 'partial' && (
                <label className="block">
                  <span className="block text-sm text-cream/80 mb-1.5">
                    Monto manual en USD (entre 0 y {order.total_usd})
                  </span>
                  <input
                    type="number" step={0.01} min={0.01} max={order.total_usd}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder={`Ej: ${(order.total_usd / 2).toFixed(2)}`}
                    className="input"
                    autoFocus
                  />
                  {refundAmount && Number(refundAmount) > 0 && Number(refundAmount) <= order.total_usd && (
                    <p className="mt-1 text-xs text-cream/50">
                      Se reintegrarán USD {Number(refundAmount).toFixed(2)} ·
                      ~ ARS {(Number(refundAmount) * (order.total_ars / order.total_usd)).toLocaleString('es-AR', { maximumFractionDigits: 0 })}.
                      La orden seguirá como "Pagada". Este monto no descuenta pasajeros del sistema.
                    </p>
                  )}
                </label>
              )}

              <label className="block">
                <span className="block text-sm text-cream/80 mb-1.5">
                  Motivo (lo verá el cliente en el email)
                </span>
                <textarea
                  rows={3} maxLength={500}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="input"
                />
              </label>

              <label className="flex items-center gap-2">
                <Checkbox checked={refundNotify} onChange={setRefundNotify} />
                <span className="text-sm text-cream/80">Notificar por email a cliente, admin y vendedor</span>
              </label>

              <div className="rounded-md border border-gold/15 bg-gold/5 p-3 text-xs text-cream/70 space-y-1">
                <p>💡 El cliente verá el crédito en su medio de pago en 2-5 días hábiles.</p>
                {refundMode === 'total' && (
                  <p>⚠ Refund total: la orden pasa a <strong className="text-cream">"Reintegrada"</strong>, la comisión al vendedor (si la había) deja de aplicar.</p>
                )}
                {refundMode === 'partial' && (
                  <p>ℹ Monto manual: la orden sigue como <strong className="text-cream">"Pagada"</strong> y no descuenta pasajeros del sistema. Esta acción es irreversible pero podés hacer otro reintegro después sobre el remanente.</p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gold/10 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setRefundOpen(false)} disabled={refundProcessing}
                className="btn-ghost text-sm disabled:opacity-40"
              >
                Cancelar
              </button>
              <button type="button" onClick={handleRefund} disabled={refundProcessing}
                className="btn-primary text-sm bg-bordeaux-light hover:bg-bordeaux-light/90 disabled:opacity-40"
              >
                {refundProcessing
                  ? 'Procesando...'
                  : refundMode === 'partial'
                    ? `Reintegrar USD ${refundAmount || '?'}`
                    : 'Confirmar reintegro total'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Comisiones y deducciones se muestran en pesos (el negocio opera en ARS).
function fmtArs(n: number): string {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

function fmtUsd(n: number): string {
  return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Si el vendedor ya cobró en dólares, el neto se muestra directo en USD (sin
// convertir) — es lo que el vendedor tiene físicamente en mano.
function cashNetDisplay(order: OrderFull): string {
  if (order.cash_collected_currency === 'USD' && order.net_total_usd != null) {
    return fmtUsd(order.net_total_usd);
  }
  return fmtArs((order.net_total_usd ?? 0) * Number(order.exchange_rate_used));
}

function Section({ title, twoColumn, children }: { title: string; twoColumn?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gold/10 bg-ink-soft/40 p-5">
      <h2 className="text-xs uppercase tracking-widest text-gold-soft mb-3">{title}</h2>
      <div className={twoColumn ? 'grid sm:grid-cols-2 gap-x-6 gap-y-2' : 'space-y-2'}>{children}</div>
    </section>
  );
}

function Row({ label, children, highlight, full }: { label: string; children: React.ReactNode; highlight?: boolean; full?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 text-sm ${full ? 'sm:col-span-2' : ''}`}>
      <span className="text-cream/50">{label}</span>
      <span className={highlight ? 'text-gold tabular-nums' : 'text-cream/90 tabular-nums'}>{children}</span>
    </div>
  );
}

function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  const color = {
    paid: 'text-gold border-gold/40 bg-gold/10',
    pending: 'text-gold-soft border-gold-soft/30 bg-gold-soft/5',
    failed: 'text-bordeaux-light border-bordeaux-light/40 bg-bordeaux-deep/20',
    cancelled: 'text-cream/50 border-cream/20 bg-cream/5',
    expired: 'text-cream/40 border-cream/15 bg-cream/5',
    refunded: 'text-cream/60 border-cream/20 bg-cream/5',
  }[status] ?? 'text-cream/60 border-cream/20';
  const label = { paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', cancelled: 'Cancelada', expired: 'Caducada', refunded: 'Reintegrada' }[status] ?? status;
  return (
    <span className={`inline-block mt-2 px-3 rounded-full border ${color} ${large ? 'py-1.5 text-sm' : 'py-0.5 text-xs'}`}>
      {label}
    </span>
  );
}
