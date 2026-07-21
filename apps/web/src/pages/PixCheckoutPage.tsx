import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import type { OrderStatus } from '../lib/api';
import Spinner from '../components/Spinner';

// Página de pago con PIX (reales). Muestra el QR + "copia e cola" que devolvió Nautt y
// confirma el pago con polling a /sync (respaldo del webhook). El QR vence a los ~15 min:
// al vencer se ofrece regenerarlo (pix-refresh) sin recrear la reserva.
const POLL_MS = 4000;

type OrderState = OrderStatus & { pix_qrcode?: string | null; pix_expires_at?: string | null; pix_fiat_amount_brl?: number | null };

export default function PixCheckoutPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const orderId = params.get('order');

  const [order, setOrder] = useState<OrderState | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const status = order?.status ?? 'pending';
  const isPaid = status === 'paid';
  const isTerminal = status === 'failed' || status === 'cancelled' || status === 'refunded';
  const expired = secondsLeft != null && secondsLeft <= 0;

  // Genera la imagen del QR a partir del "copia e cola" (BR Code EMV estándar).
  const buildQr = useCallback((code: string) => {
    QRCode.toDataURL(code, { width: 320, margin: 1, color: { dark: '#0b0b0f', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, []);

  // Carga inicial de la orden.
  useEffect(() => {
    if (!orderId) { setLoading(false); setNotFound(true); return; }
    let cancelled = false;
    api.checkout.getOrder(orderId)
      .then((o) => {
        if (cancelled) return;
        setOrder(o as OrderState);
        if (o.pix_qrcode) buildQr(o.pix_qrcode);
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId, buildQr]);

  // Redirección al confirmarse el pago.
  useEffect(() => {
    if (isPaid && orderId) {
      const to = setTimeout(() => {
        globalThis.location.href = `/checkout/success?order=${encodeURIComponent(orderId)}`;
      }, 1200);
      return () => clearTimeout(to);
    }
  }, [isPaid, orderId]);

  // Polling de confirmación mientras la orden sigue pendiente.
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!orderId || isPaid || isTerminal) return;
    const tick = async () => {
      try {
        const r = await api.checkout.syncOrder(orderId);
        setOrder((prev) => (prev ? { ...prev, status: r.status } : prev));
      } catch { /* reintentamos en el próximo ciclo */ }
    };
    pollRef.current = window.setInterval(tick, POLL_MS);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [orderId, isPaid, isTerminal]);

  // Cuenta regresiva del vencimiento del QR.
  useEffect(() => {
    if (!order?.pix_expires_at) { setSecondsLeft(null); return; }
    const target = new Date(order.pix_expires_at).getTime();
    const update = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [order?.pix_expires_at]);

  const handleCopy = async () => {
    if (!order?.pix_qrcode) return;
    try {
      await navigator.clipboard.writeText(order.pix_qrcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* algunos navegadores sin permiso de clipboard */ }
  };

  const handleRefresh = async () => {
    if (!orderId) return;
    setRefreshing(true);
    try {
      const r = await api.checkout.refreshPix(orderId);
      setOrder((prev) => (prev ? {
        ...prev,
        pix_qrcode: r.pix_qrcode,
        pix_expires_at: r.pix_expires_at,
        pix_fiat_amount_brl: r.fiat_brl,
      } : prev));
      buildQr(r.pix_qrcode);
    } catch { /* mostramos el estado actual */ }
    finally { setRefreshing(false); }
  };

  if (loading) {
    return (
      <section className="container-narrow py-24 text-center">
        <Spinner size="lg" className="mx-auto" />
        <p className="mt-4 text-cream/60">{t('pix.loading')}</p>
      </section>
    );
  }

  if (notFound || !order) {
    return (
      <section className="container-narrow py-24 text-center">
        <h1 className="font-display text-3xl text-cream">{t('pix.not_found_title')}</h1>
        <p className="mt-3 text-cream/60">{t('pix.not_found_subtitle')}</p>
        <div className="mt-8"><Link to="/shows" className="btn-primary">{t('return.back_to_shows')}</Link></div>
      </section>
    );
  }

  // Estado pagado o terminal.
  if (isPaid) {
    return (
      <PixCenteredCard
        icon="✓" tone="ok"
        title={t('pix.paid_title')} subtitle={t('pix.paid_subtitle')}
      >
        <Spinner size="sm" className="mx-auto mt-2" />
      </PixCenteredCard>
    );
  }
  if (isTerminal) {
    return (
      <PixCenteredCard
        icon="×" tone="bad"
        title={t('pix.failed_title')} subtitle={t('pix.failed_subtitle')}
      >
        <Link to="/shows" className="btn-primary mt-4 inline-block">{t('return.back_to_shows')}</Link>
      </PixCenteredCard>
    );
  }

  const brl = order.pix_fiat_amount_brl;

  return (
    <section className="container-narrow py-16">
      <div className="max-w-lg mx-auto">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#32BCAD]/30 bg-[#32BCAD]/10 px-4 py-1.5 text-sm text-[#32BCAD]">
            <PixGlyph /> PIX
          </span>
          <h1 className="mt-5 font-display text-3xl text-cream">{t('pix.title')}</h1>
          <p className="mt-2 text-cream/60 text-sm">{t('pix.subtitle')}</p>
        </div>

        <div className="mt-8 rounded-2xl border border-gold/15 bg-ink-soft/70 p-6">
          {/* Monto */}
          <div className="flex items-baseline justify-between border-b border-gold/10 pb-4">
            <span className="text-sm text-cream/60">{t('pix.amount_to_pay')}</span>
            <div className="text-right">
              {brl != null && <p className="font-display text-3xl text-gold">R$ {brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
              <p className="text-xs text-cream/50">USD {order.total_usd}</p>
            </div>
          </div>

          {/* QR */}
          <div className="mt-6 flex flex-col items-center">
            {expired ? (
              <div className="flex h-[280px] w-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gold/25 bg-ink/40 px-6 text-center">
                <p className="text-cream/70 text-sm">{t('pix.expired_note')}</p>
                <button type="button" onClick={handleRefresh} disabled={refreshing} className="btn-primary mt-4 disabled:opacity-50">
                  {refreshing ? <><Spinner size="sm" className="mr-2" />{t('pix.refreshing')}</> : t('pix.refresh')}
                </button>
              </div>
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="QR PIX" className="h-[280px] w-[280px] rounded-xl bg-white p-3" />
            ) : (
              <div className="flex h-[280px] w-[280px] items-center justify-center rounded-xl bg-ink/40"><Spinner size="lg" /></div>
            )}

            {!expired && secondsLeft != null && (
              <p className="mt-3 text-xs text-cream/50">
                {t('pix.expires_in')} <span className="font-mono text-cream/80">{formatMMSS(secondsLeft)}</span>
              </p>
            )}
          </div>

          {/* Copia e cola */}
          {!expired && order.pix_qrcode && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-widest text-gold-soft">{t('pix.copy_paste_label')}</p>
              <div className="mt-2 flex items-stretch gap-2">
                <code className="flex-1 truncate rounded-lg border border-gold/15 bg-ink/50 px-3 py-2.5 text-xs text-cream/70">
                  {order.pix_qrcode}
                </code>
                <button
                  type="button" onClick={handleCopy}
                  className="shrink-0 rounded-lg border border-[#32BCAD]/40 bg-[#32BCAD]/10 px-4 text-sm text-[#32BCAD] hover:bg-[#32BCAD]/20 transition"
                >
                  {copied ? t('pix.copied') : t('pix.copy')}
                </button>
              </div>
            </div>
          )}

          {/* Estado de espera */}
          <div className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-gold/5 border border-gold/15 px-4 py-3">
            <Spinner size="sm" />
            <p className="text-xs text-cream/60">{t('pix.waiting')}</p>
          </div>
        </div>

        {/* Instrucciones */}
        <ol className="mt-6 space-y-2 text-sm text-cream/60">
          <li>1. {t('pix.step_1')}</li>
          <li>2. {t('pix.step_2')}</li>
          <li>3. {t('pix.step_3')}</li>
        </ol>

        <p className="mt-6 text-center text-xs text-cream/40">
          {t('pix.order_ref')}: <span className="font-mono">{order.public_id.slice(0, 8)}</span>
        </p>
      </div>
    </section>
  );
}

function formatMMSS(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PixGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M10 2L18 10L10 18L2 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}

function PixCenteredCard({ icon, tone, title, subtitle, children }: {
  icon: string; tone: 'ok' | 'bad'; title: string; subtitle: string; children?: React.ReactNode;
}) {
  const toneClass = tone === 'ok'
    ? 'bg-gold/20 text-gold border border-gold/40'
    : 'bg-bordeaux-light/20 text-bordeaux-light border border-bordeaux-light/40';
  return (
    <section className="container-narrow py-24">
      <div className="max-w-md mx-auto text-center">
        <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center text-3xl ${toneClass}`}>{icon}</div>
        <h1 className="mt-6 font-display text-3xl text-cream">{title}</h1>
        <p className="mt-3 text-cream/70">{subtitle}</p>
        {children}
      </div>
    </section>
  );
}
