import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { OrderStatus } from '../lib/api';

type Variant = 'success' | 'failure' | 'pending' | 'cash';

interface Props {
  variant: Variant;
}

export default function CheckoutReturn({ variant }: Props) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const orderId = params.get('order');
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      // En los retornos de Mercado Pago confirmamos el pago consultando MP
      // directamente (respaldo del webhook): si el cobro se aprobó, la orden
      // queda 'paid' y se dispara el email, aunque el webhook no haya llegado.
      if (variant === 'success' || variant === 'pending') {
        try { await api.checkout.syncOrder(orderId); } catch { /* seguimos igual */ }
      }
      try {
        const o = await api.checkout.getOrder(orderId);
        if (!cancelled) setOrder(o);
      } catch { /* mostramos el mensaje genérico igual */ }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [orderId, variant]);

  const config = VARIANTS[variant];

  return (
    <section className="container-narrow py-24">
      <div className="max-w-xl mx-auto text-center">
        <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center text-3xl ${config.iconBg}`}>
          {config.icon}
        </div>
        <h1 className="mt-6 font-display text-4xl text-cream">
          {t(config.titleKey)}
        </h1>
        <p className="mt-3 text-cream/70">
          {t(config.subtitleKey)}
        </p>

        {orderId && (
          <div className="mt-8 rounded-lg border border-gold/15 bg-ink-soft/70 p-6 text-left">
            <p className="text-xs uppercase tracking-widest text-gold-soft">{t('return.order_ref')}</p>
            <p className="mt-1 font-mono text-sm text-cream/80 break-all">{orderId}</p>

            {!loading && order && (
              <div className="mt-4 pt-4 border-t border-gold/10 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-cream/50">{t('return.amount')}</p>
                  <p className="text-cream">USD {order.total_usd}</p>
                </div>
                <div>
                  <p className="text-cream/50">{t('return.status')}</p>
                  <p className={statusColor(order.status)}>{t(`return.status_${order.status}`)}</p>
                </div>
                {order.payment_method === 'cash' && (
                  <div className="col-span-2">
                    <p className="text-xs text-gold-soft">{t('return.cash_method')}</p>
                  </div>
                )}
              </div>
            )}
            {!loading && !order && (
              <p className="mt-3 text-sm text-cream/50">{t('return.order_not_found')}</p>
            )}
          </div>
        )}

        <div className="mt-10 flex flex-wrap gap-3 justify-center">
          <Link to="/shows" className="btn-ghost">{t('return.back_to_shows')}</Link>
          <Link to="/" className="btn-primary">{t('return.back_home')}</Link>
        </div>
      </div>
    </section>
  );
}

const VARIANTS: Record<Variant, {
  icon: string;
  iconBg: string;
  titleKey: string;
  subtitleKey: string;
}> = {
  success: {
    icon: '✓',
    iconBg: 'bg-gold/20 text-gold border border-gold/40',
    titleKey: 'return.success_title',
    subtitleKey: 'return.success_subtitle',
  },
  cash: {
    icon: '✓',
    iconBg: 'bg-gold/20 text-gold border border-gold/40',
    titleKey: 'return.cash_title',
    subtitleKey: 'return.cash_subtitle',
  },
  pending: {
    icon: '◷',
    iconBg: 'bg-gold-soft/15 text-gold-soft border border-gold-soft/30',
    titleKey: 'return.pending_title',
    subtitleKey: 'return.pending_subtitle',
  },
  failure: {
    icon: '×',
    iconBg: 'bg-bordeaux-light/20 text-bordeaux-light border border-bordeaux-light/40',
    titleKey: 'return.failure_title',
    subtitleKey: 'return.failure_subtitle',
  },
};

function statusColor(status: OrderStatus['status']): string {
  switch (status) {
    case 'paid': return 'text-gold';
    case 'pending': return 'text-gold-soft';
    case 'failed':
    case 'cancelled': return 'text-bordeaux-light';
    case 'refunded': return 'text-cream/60';
    default: return 'text-cream';
  }
}
