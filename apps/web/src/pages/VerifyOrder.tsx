import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { OrderVerification } from '../lib/api';

// Página pública (sin login) a la que apunta el QR del voucher. Muestra el estado
// EN VIVO de la reserva — consultado a la base en el momento, nunca una foto vieja —
// para que la casa de tango pueda confiar en el número de pasajeros aunque el
// pasajero le muestre un email o PDF anterior a la última modificación.
export default function VerifyOrder() {
  const { publicId } = useParams<{ publicId: string }>();
  const [order, setOrder] = useState<OrderVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicId) { setLoading(false); setError('not_found'); return; }
    let cancelled = false;
    api.checkout.verify(publicId)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch(() => { if (!cancelled) setError('not_found'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [publicId]);

  return (
    <section className="container-narrow py-16 md:py-24">
      <div className="max-w-lg mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft text-center">
          Tango QR
        </p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl text-cream text-center">
          Verificación de reserva
        </h1>
        <p className="mt-2 text-sm text-cream/50 text-center">
          Este estado se consulta en el momento — siempre es el más actual, sin importar qué comprobante te muestren.
        </p>

        <div className="mt-8 rounded-xl border border-gold/15 bg-ink-soft/70 p-6 md:p-8">
          {loading && (
            <div className="space-y-3">
              <div className="h-6 rounded bg-ink/40 animate-pulse" />
              <div className="h-6 rounded bg-ink/40 animate-pulse w-2/3" />
              <div className="h-6 rounded bg-ink/40 animate-pulse w-1/2" />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-4">
              <p className="text-2xl mb-2">⚠</p>
              <p className="text-cream/80 font-medium">No encontramos esta reserva</p>
              <p className="mt-1 text-sm text-cream/50">Revisá el código o pedile al pasajero el comprobante actualizado.</p>
            </div>
          )}

          {!loading && order && (
            <>
              <StatusBanner status={order.status} />

              <div className="mt-5 space-y-3 text-sm">
                <Row label="Pasajero">{order.customer_name}</Row>
                <Row label="Casa de tango">{order.product_name}</Row>
                <Row label="Experiencia">{order.option_name}</Row>
                <Row label="Fecha">{order.service_date}</Row>
                <Row label="Pasajeros" highlight>
                  {order.adults} adulto{order.adults !== 1 ? 's' : ''}
                  {order.children > 0 ? ` · ${order.children} menor${order.children !== 1 ? 'es' : ''}` : ''}
                </Row>
                {order.transfer_requested && <Row label="Traslado">Incluido</Row>}
                <Row label="Referencia"><span className="font-mono text-xs">{order.public_id}</span></Row>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-xs text-cream/30 text-center">
          ¿Dudas? Escribinos por WhatsApp con el número de referencia de la reserva.
        </p>

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-gold-soft hover:text-gold transition">← Volver al inicio</Link>
        </div>
      </div>
    </section>
  );
}

function StatusBanner({ status }: Readonly<{ status: OrderVerification['status'] }>) {
  const map: Record<OrderVerification['status'], { label: string; cls: string; icon: string }> = {
    paid: { label: 'Vigente', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', icon: '✓' },
    pending: { label: 'Pendiente de pago', cls: 'border-gold-soft/40 bg-gold-soft/10 text-gold-soft', icon: '⏳' },
    cancelled: { label: 'Cancelada', cls: 'border-red-500/40 bg-red-500/10 text-red-300', icon: '✕' },
    refunded: { label: 'Reintegrada', cls: 'border-cream/25 bg-cream/5 text-cream/60', icon: '✕' },
    expired: { label: 'Vencida', cls: 'border-cream/25 bg-cream/5 text-cream/60', icon: '✕' },
    failed: { label: 'Fallida', cls: 'border-red-500/40 bg-red-500/10 text-red-300', icon: '✕' },
  };
  const s = map[status] ?? map.failed;
  return (
    <div className={`rounded-lg border px-4 py-3 text-center font-display text-xl ${s.cls}`}>
      {s.icon} {s.label}
    </div>
  );
}

function Row({ label, children, highlight }: Readonly<{ label: string; children: React.ReactNode; highlight?: boolean }>) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-gold/5 last:border-0">
      <span className="text-cream/45 shrink-0">{label}</span>
      <span className={`text-right ${highlight ? 'text-gold font-semibold' : 'text-cream/85'}`}>{children}</span>
    </div>
  );
}
