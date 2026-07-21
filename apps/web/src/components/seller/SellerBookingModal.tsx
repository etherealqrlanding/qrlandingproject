import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sellerApi, SellerApiError, type SellerBookingInput, type SellerBookingResult } from '../../lib/sellerApi';
import type { ProductDetail, ProductOption } from '../../types/api';
import BookingForm from '../booking/BookingForm';

interface Props {
  product: ProductDetail;
  option: ProductOption;
  onClose: () => void;
  isPermanent: boolean;
}

export default function SellerBookingModal({ product, option, onClose, isPermanent }: Props) {
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SellerBookingResult | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleValidSubmit = async (payload: SellerBookingInput): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await sellerApi.checkout.create(payload);
      // MP: el vendedor no ve ni reenvía el link — se lo mandamos al pasajero por email.
      setResult(res);
    } catch (err) {
      const message = err instanceof SellerApiError ? err.message : (err as Error).message;
      setError(message);
      setSubmitting(false);
    }
  };

  // ── Pantalla de éxito: MP (avisamos que el email ya salió) o efectivo ────
  if (result) {
    const isMp = result.payment_method === 'mercadopago';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/85 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gold" aria-hidden>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {isMp ? (
            <>
              <h2 className="font-display text-2xl text-cream mb-2">¡Reserva creada!</h2>
              <p className="text-sm text-cream/60 mb-1">
                Ref. <span className="font-mono text-gold-soft">{result.order_public_id.slice(0, 8).toUpperCase()}</span>
              </p>
              <p className="text-sm text-cream/70 mb-6">
                Le enviamos el link de pago al pasajero para que pague con su propia cuenta o tarjeta.
                La reserva queda pendiente hasta que complete el pago. Si no le llega, que se contacte con nosotros.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/seller/ventas')}
                  className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
                >
                  Ver mis ventas
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
                >
                  Nueva reserva
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl text-cream mb-2">¡Reserva ingresada!</h2>
              <p className="text-sm text-cream/60 mb-1">
                Ref. <span className="font-mono text-gold-soft">{result.order_public_id.slice(0, 8).toUpperCase()}</span>
              </p>
              <p className="text-sm text-cream/70 mb-6">
                La reserva fue registrada como <strong className="text-cream/90">ingresada manualmente por el vendedor</strong>.
                Coordiná el cobro en efectivo con el pasajero.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/seller/ventas')}
                  className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
                >
                  Ver mis ventas
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
                >
                  Nueva reserva
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Formulario ────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm"
    >
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="relative w-full max-w-2xl rounded-2xl bg-ink-soft border border-gold/20">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
          >
            ×
          </button>

          {/* Header */}
          <div className="p-7 border-b border-gold/10">
            <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">{product.venue_name}</p>
            <h2 className="mt-2 font-display text-3xl text-cream">{option.name_es}</h2>
          </div>

          <div className="p-7">
            <BookingForm
              option={option}
              allowCash={isPermanent}
              submitting={submitting}
              externalError={error}
              submitLabels={{ cash: 'Confirmar reserva manual', mercadopago: 'Ir a Mercado Pago' }}
              onValidSubmit={handleValidSubmit}
              contextBanner={(
                <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 md:p-4 flex gap-3">
                  <span className="text-gold text-base mt-0.5" aria-hidden>✦</span>
                  <div className="text-xs text-cream/70 leading-relaxed">
                    <strong className="text-cream/90">Estás ingresando esta reserva como vendedor.</strong>{' '}
                    La orden quedará marcada como <em>ingresada manualmente</em>.
                    Elegí <strong>Efectivo</strong> si el pasajero paga en el momento,
                    o <strong>Mercado Pago</strong> para redirigir al pago online.
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
