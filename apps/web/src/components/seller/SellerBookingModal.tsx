import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sellerApi, SellerApiError, type SellerBookingInput, type SellerBookingResult, type SellerMember } from '../../lib/sellerApi';
import type { ProductDetail, ProductOption } from '../../types/api';
import BookingForm from '../booking/BookingForm';
import { getLastMemberId, setLastMemberId } from '../../lib/lastMember';

interface Props {
  product: ProductDetail;
  option: ProductOption;
  onClose: () => void;
  isPermanent: boolean;
  cardEnabled: boolean;
  // Modo abierto (sellers.team_pin_required = false): elegir quién cerró la venta
  // sigue siendo posible, pero sin pedir PIN.
  pinRequired: boolean;
  initialDate?: string;
  initialAdults?: number;
  initialChildren?: number;
}

export default function SellerBookingModal({ product, option, onClose, isPermanent, cardEnabled, pinRequired, initialDate, initialAdults, initialChildren }: Props) {
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SellerBookingResult | null>(null);

  // Sub-vendedores (ej. conserjes) de mi equipo — el selector solo aparece si tengo
  // alguno cargado, para no meterle un campo de más al 99% de los vendedores que
  // venden solos.
  const [members, setMembers] = useState<SellerMember[]>([]);
  const [memberId, setMemberId] = useState<number | ''>('');
  const [memberPin, setMemberPin] = useState('');

  useEffect(() => {
    sellerApi.members.list().then((list) => {
      const active = list.filter((m) => m.is_active);
      setMembers(active);
      // Modo abierto: precarga el último elegido en este dispositivo, para no
      // tener que volver a buscarlo en el select en cada venta del turno.
      if (!pinRequired) {
        const last = getLastMemberId();
        if (last != null && active.some((m) => m.id === last)) setMemberId(last);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (pinRequired && memberId !== '' && !/^\d{4,6}$/.test(memberPin)) {
      setError('Ingresá el PIN de la persona que cerró la venta (4-6 dígitos).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await sellerApi.checkout.create({
        ...payload,
        ...(memberId !== ''
          ? pinRequired
            ? { seller_member_id: memberId, seller_member_pin: memberPin }
            : { seller_member_id: memberId }
          : {}),
      });
      if (!pinRequired) setLastMemberId(memberId === '' ? null : memberId);
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
    // MP y PIX comparten pantalla: en ambos el pasajero recibe el link de pago por email.
    const isOnline = result.payment_method !== 'cash';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
        <div className="relative w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-8 text-center animate-modal-panel">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gold" aria-hidden>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {isOnline ? (
            <>
              <h2 className="font-display text-2xl text-cream mb-2">¡Reserva creada!</h2>
              <p className="text-sm text-cream/60 mb-1">
                Ref. <span className="font-mono text-gold-soft">{result.order_public_id.slice(0, 8).toUpperCase()}</span>
              </p>
              <p className="text-sm text-cream/70 mb-6">
                {result.payment_method === 'pix'
                  ? 'Le enviamos al pasajero por email el link para pagar con PIX (en reales, con QR o clave copia e cola).'
                  : 'Le enviamos el link de pago al pasajero para que pague con su propia cuenta o tarjeta.'}
                {' '}La reserva queda pendiente hasta que complete el pago. Si no le llega, que se contacte con nosotros.
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
                La reserva fue registrada como <strong className="text-cream/90">ingresada manualmente por el recomendador</strong>.
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
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm animate-modal-backdrop"
    >
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="relative w-full max-w-2xl rounded-2xl bg-ink-soft border border-gold/20 animate-modal-panel">
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
            {members.length > 0 && (
              <div className="mb-5 rounded-lg border border-gold/20 bg-gold/5 p-3 md:p-4">
                <p className="text-xs text-cream/70 mb-1">
                  <strong className="text-cream/90">¿Quién de tu equipo cerró esta venta?</strong> Opcional — dejalo en blanco si la venta es "de la casa".
                </p>
                {pinRequired && (
                  <p className="text-[11px] text-cream/35 mb-2">
                    Si elegís a alguien, va a pedirle su PIN — no es una contraseña, solo confirma que fue esa persona.
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={memberId}
                    onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')}
                    className="flex-1 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/40"
                  >
                    <option value="">— Sin especificar —</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {pinRequired && memberId !== '' && (
                    <input
                      value={memberPin}
                      onChange={(e) => setMemberPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Su PIN"
                      inputMode="numeric"
                      className="sm:w-32 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                    />
                  )}
                </div>
              </div>
            )}
            <BookingForm
              option={option}
              childrenAgeLabel={product.children_age_label}
              infantAgeLabel={product.infant_age_label}
              allowCash={isPermanent}
              allowCard={cardEnabled}
              submitting={submitting}
              externalError={error}
              initialDate={initialDate}
              initialAdults={initialAdults}
              initialChildren={initialChildren}
              submitLabels={{ cash: 'Confirmar reserva manual', mercadopago: 'Enviar link de Mercado Pago', pix: 'Enviar link de PIX' }}
              onValidSubmit={handleValidSubmit}
              contextBanner={(
                <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 md:p-4 flex gap-3">
                  <span className="text-gold text-base mt-0.5" aria-hidden>✦</span>
                  <div className="text-xs text-cream/70 leading-relaxed">
                    <strong className="text-cream/90">Estás ingresando esta reserva como recomendador.</strong>{' '}
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
