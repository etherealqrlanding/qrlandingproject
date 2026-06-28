import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sellerApi, SellerApiError, type SellerNotification } from '../../lib/sellerApi';
import { useSellerAuth } from '../../hooks/useSellerAuth';

const TYPE_CONFIG: Record<string, { icon: string; accent: string }> = {
  order_paid:           { icon: '🏆', accent: 'border-gold/30 bg-gold/5' },
  commission_paid:      { icon: '💰', accent: 'border-emerald-800/40 bg-emerald-900/10' },
  cash_booking_pending: { icon: '💵', accent: 'border-amber-800/40 bg-amber-900/10' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SellerNotifications() {
  const { refresh } = useSellerAuth();
  const [notifications, setNotifications] = useState<SellerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sellerApi.notifications.list()
      .then((data) => {
        setNotifications(data);
        // Marcar como leídas en background y refrescar el contador del sidebar
        sellerApi.notifications.markAllRead()
          .then(() => refresh())
          .catch(() => {});
      })
      .catch((err) => setError((err as SellerApiError).message))
      .finally(() => setLoading(false));
  }, [refresh]);

  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <header className="mb-5 md:mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Portal de Vendedores</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Notificaciones</h1>
        {!loading && unread > 0 && (
          <p className="mt-0.5 text-xs md:text-sm text-gold-soft">
            {unread} notificación{unread !== 1 ? 'es' : ''} sin leer
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-12 text-center">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-cream/60 text-sm">Todavía no tenés notificaciones.</p>
          <p className="text-cream/40 text-xs mt-1">Acá vas a ver avisos de ventas, liquidaciones y más.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? { icon: '🔔', accent: 'border-gold/10 bg-ink-soft/40' };
            const isUnread = !n.read_at;
            return (
              <div
                key={n.id}
                className={`rounded-xl border p-5 transition ${cfg.accent} ${isUnread ? 'ring-1 ring-gold/20' : 'opacity-80'}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5" aria-hidden>{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-cream font-medium text-sm">{n.title}</p>
                      {isUnread && (
                        <span className="h-1.5 w-1.5 rounded-full bg-gold shrink-0" aria-label="No leída" />
                      )}
                    </div>
                    <p className="text-cream/70 text-sm leading-relaxed">{n.body}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <p className="text-xs text-cream/35">{fmtDate(n.created_at)}</p>
                      {n.type === 'cash_booking_pending' && typeof n.metadata.order_public_id === 'string' && (
                        <Link
                          to={`/seller/ventas?highlight=${encodeURIComponent(n.metadata.order_public_id)}`}
                          className="ml-auto rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs font-medium text-gold-soft hover:bg-gold/15 transition-colors"
                        >
                          Ver venta →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recordatorio de contacto */}
      <div className="mt-6 md:mt-10 rounded-xl border border-gold/10 bg-ink-soft/20 p-4 md:p-5 flex gap-3 md:gap-4 items-start">
        <span className="text-2xl leading-none" aria-hidden>💬</span>
        <div>
          <p className="text-sm text-cream/80 font-medium mb-1">¿Tenés alguna duda?</p>
          <p className="text-sm text-cream/60 leading-relaxed">
            Ante cualquier consulta sobre tus ventas, comisiones o liquidaciones, escribinos.
            Te respondemos a la brevedad.
          </p>
          <a
            href="https://wa.me/5491100000000"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 mt-3 rounded-lg border border-gold/20 bg-gold/5 px-4 py-2 text-sm text-gold-soft hover:bg-gold/10 transition"
          >
            Contactar por WhatsApp →
          </a>
        </div>
      </div>
    </div>
  );
}
