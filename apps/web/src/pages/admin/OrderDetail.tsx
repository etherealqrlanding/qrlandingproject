import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi, AdminApiError } from '../../lib/adminApi';

interface OrderFull {
  id: number;
  public_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  total_usd: number;
  total_ars: number;
  exchange_rate_used: string;
  ref_code: string | null;
  mp_payment_id: string | null;
  mp_payment_status: string | null;
  mp_payment_method: string | null;
  internal_notes: string | null;
  paid_at: string | null;
  created_at: string;
  seller_id: number | null;
  seller_code: string | null;
  seller_name: string | null;
  commission_percent_snapshot: string | null;
  commission_amount_usd: number | null;
  commission_amount_ars: number | null;
  paid_to_seller_at: string | null;
  items: Array<{
    id: number;
    product_name_snapshot: string;
    option_name_snapshot: string;
    service_date: string;
    adults: number;
    children: number;
    unit_price_adult_usd: string;
    unit_price_child_usd: string | null;
    subtotal_usd: string;
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
  const [order, setOrder] = useState<OrderFull | null>(null);
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

  const load = async () => {
    if (!publicId) return;
    try {
      const data = await adminApi.orders.get(publicId);
      setOrder(data as unknown as OrderFull);
      setNewStatus((data as unknown as OrderFull).status);
    } catch (err) {
      setError((err as AdminApiError).message);
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

  const handleMarkCommissionPaid = async () => {
    if (!order || !order.seller_id) return;
    const confirm1 = confirm(
      `¿Marcar la comisión de esta orden como liquidada al vendedor?\n\nVendedor: ${order.seller_name}\nComisión: USD ${order.commission_amount_usd}\n\nSe notificará al vendedor automáticamente.`,
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

  if (error) return <div className="p-8"><div className="text-bordeaux-light">{error}</div></div>;
  if (!order) return <div className="p-8"><div className="h-32 rounded bg-ink-soft/60 animate-pulse" /></div>;

  return (
    <div className="p-8 max-w-5xl">
      <Link to="/admin/orders" className="text-sm text-gold-soft hover:text-gold">← Volver al listado</Link>

      <header className="mt-3 mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Orden</p>
        <h1 className="mt-1 font-display text-3xl text-cream font-mono break-all">{order.public_id}</h1>
        <p className="mt-1 text-sm text-cream/50">Creada el {new Date(order.created_at).toLocaleString()}</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-6">
          <Section title="Cliente">
            <Row label="Nombre">{order.customer_name}</Row>
            <Row label="Email">{order.customer_email}</Row>
            <Row label="Teléfono">{order.customer_phone ?? '—'}</Row>
            <Row label="Nacionalidad">{order.customer_nationality ?? '—'}</Row>
          </Section>

          {order.items.map((item) => (
            <Section key={item.id} title="Servicio">
              <Row label="Producto">{item.product_name_snapshot}</Row>
              <Row label="Tier">{item.option_name_snapshot}</Row>
              <Row label="Fecha del servicio">{item.service_date}</Row>
              <Row label="Adultos">{item.adults} × USD {item.unit_price_adult_usd}</Row>
              {item.children > 0 && (
                <Row label="Menores">{item.children} × USD {item.unit_price_child_usd ?? 0}</Row>
              )}
              <Row label="Subtotal" highlight>USD {item.subtotal_usd}</Row>
            </Section>
          ))}

          <Section title="Mercado Pago">
            <Row label="Payment ID">{order.mp_payment_id ?? '—'}</Row>
            <Row label="Estado MP">{order.mp_payment_status ?? '—'}</Row>
            <Row label="Método">{order.mp_payment_method ?? '—'}</Row>
          </Section>

          {order.events.length > 0 && (
            <Section title="Eventos">
              <div className="space-y-2">
                {order.events.map((ev) => (
                  <div key={ev.id} className="text-xs border-l-2 border-gold/20 pl-3 py-1">
                    <p className="text-cream font-mono">{ev.event_type}</p>
                    <p className="text-cream/40">{new Date(ev.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-gold/20 bg-ink-soft/70 p-5">
            <p className="text-xs uppercase tracking-widest text-gold-soft">Estado</p>
            <StatusBadge status={order.status} large />
            <div className="mt-4 space-y-2">
              <Row label="Total USD" highlight>USD {order.total_usd}</Row>
              <Row label="Total ARS">ARS {order.total_ars.toLocaleString('es-AR')}</Row>
              <Row label="Tipo de cambio">{Number(order.exchange_rate_used).toFixed(2)}</Row>
              {order.paid_at && <Row label="Pagada">{new Date(order.paid_at).toLocaleString()}</Row>}
            </div>
          </div>

          {order.seller_name ? (
            <div className="rounded-lg border border-gold/20 bg-gold/5 p-5">
              <p className="text-xs uppercase tracking-widest text-gold-soft">Atribución</p>
              <Link to={`/admin/sellers/${order.seller_id}`} className="block mt-1 font-display text-xl text-cream hover:text-gold">
                {order.seller_name}
              </Link>
              <p className="text-xs text-gold-soft font-mono">{order.seller_code}</p>
              <div className="mt-3 space-y-1.5">
                <Row label="Comisión">{Number(order.commission_percent_snapshot ?? 0).toFixed(1)}%</Row>
                <Row label="USD" highlight>USD {order.commission_amount_usd ?? 0}</Row>
                <Row label="ARS">ARS {(order.commission_amount_ars ?? 0).toLocaleString('es-AR')}</Row>
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

          {/* Acción crítica: cancelar y reintegrar (solo si está pagada y no fue ya reintegrada) */}
          {order.status === 'paid' && order.mp_payment_id && (
            <div className="rounded-lg border border-bordeaux-light/40 bg-bordeaux-deep/15 p-5">
              <p className="text-xs uppercase tracking-widest text-bordeaux-light">Sin cupo / cancelar</p>
              <p className="mt-2 text-sm text-cream/70">
                Si la casa no puede confirmar, podés <strong>cancelar la reserva y reintegrar</strong> el monto completo
                al cliente en su medio de pago original.
              </p>
              <button type="button" onClick={() => setRefundOpen(true)}
                className="btn-primary mt-4 w-full text-sm bg-bordeaux-light hover:bg-bordeaux-light/90 focus:ring-bordeaux-light/40"
              >
                Cancelar y reintegrar
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
        </aside>
      </div>

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
              {/* Selector total / parcial */}
              <div>
                <span className="block text-sm text-cream/80 mb-2">Monto a reintegrar</span>
                <div className="grid grid-cols-2 gap-2">
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
                    onClick={() => setRefundMode('partial')}
                    className={`px-3 py-2 rounded-md border text-sm transition ${
                      refundMode === 'partial'
                        ? 'border-bordeaux-light bg-bordeaux-deep/30 text-cream'
                        : 'border-gold/15 bg-ink/40 text-cream/60 hover:border-gold/30'
                    }`}
                  >
                    Parcial
                  </button>
                </div>
              </div>

              {refundMode === 'partial' && (
                <label className="block">
                  <span className="block text-sm text-cream/80 mb-1.5">
                    Monto parcial en USD (entre 0 y {order.total_usd})
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
                      La orden seguirá como "Pagada".
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
                <input
                  type="checkbox" checked={refundNotify}
                  onChange={(e) => setRefundNotify(e.target.checked)}
                  className="accent-gold"
                />
                <span className="text-sm text-cream/80">Notificar por email a cliente, admin y vendedor</span>
              </label>

              <div className="rounded-md border border-gold/15 bg-gold/5 p-3 text-xs text-cream/70 space-y-1">
                <p>💡 El cliente verá el crédito en su medio de pago en 2-5 días hábiles.</p>
                {refundMode === 'total' && (
                  <p>⚠ Refund total: la orden pasa a <strong className="text-cream">"Reintegrada"</strong>, la comisión al vendedor (si la había) deja de aplicar.</p>
                )}
                {refundMode === 'partial' && (
                  <p>ℹ Refund parcial: la orden sigue como <strong className="text-cream">"Pagada"</strong>. Esta acción es irreversible pero podés hacer otro refund parcial después sobre el remanente.</p>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gold/10 bg-ink-soft/40 p-5">
      <h2 className="text-xs uppercase tracking-widest text-gold-soft mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
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
    refunded: 'text-cream/60 border-cream/20 bg-cream/5',
  }[status] ?? 'text-cream/60 border-cream/20';
  const label = { paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', cancelled: 'Cancelada', refunded: 'Reintegrada' }[status] ?? status;
  return (
    <span className={`inline-block mt-2 px-3 rounded-full border ${color} ${large ? 'py-1.5 text-sm' : 'py-0.5 text-xs'}`}>
      {label}
    </span>
  );
}
