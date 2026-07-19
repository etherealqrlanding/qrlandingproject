import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AvailabilityDay } from '../../lib/api';
import { sellerApi, SellerApiError, type SellerBookingResult } from '../../lib/sellerApi';
import type { ProductDetail, ProductOption } from '../../types/api';
import TransferSection from '../TransferSection';
import Spinner from '../Spinner';

interface Props {
  product: ProductDetail;
  option: ProductOption;
  onClose: () => void;
  isPermanent: boolean;
}

const NATIONALITIES = [
  'Argentina', 'Brasil', 'Estados Unidos', 'Reino Unido', 'España',
  'Italia', 'Francia', 'Alemania', 'Chile', 'Uruguay', 'México', 'Otra',
];

export default function SellerBookingModal({ product, option, onClose, isPermanent }: Props) {
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SellerBookingResult | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'cash'>(isPermanent ? 'cash' : 'mercadopago');
  const [cutoffTime, setCutoffTime] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [wantsTransfer, setWantsTransfer] = useState(option.has_transfer);
  const [transferHotel, setTransferHotel] = useState('');
  const [transferRoom, setTransferRoom] = useState('');
  // Monto que el vendedor le cobra al pasajero en efectivo. Es SOLO referencia visual
  // para el momento del cobro: no se envía al backend ni se guarda en ningún lado.
  const [chargedAmount, setChargedAmount] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const horizonDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  }, []);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    nationality: '',
    dni: '',
    service_date: today,
    adults: 2,
    children: 0,
  });

  const [availability, setAvailability] = useState<Map<string, AvailabilityDay>>(new Map());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    api.settings.bookingCutoff().then((d) => setCutoffTime(d.time)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAvailabilityLoading(true);
    api.availability.forOption(option.id, today, horizonDate)
      .then((days) => {
        if (cancelled) return;
        setAvailability(new Map(days.map((d) => [d.date, d])));
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancelled) setAvailabilityLoading(false); });
    return () => { cancelled = true; };
  }, [option.id, today, horizonDate]);

  useEffect(() => {
    let cancelled = false;
    setRemaining(null);
    api.availability.remainingForDate(option.id, form.service_date)
      .then((d) => {
        if (cancelled) return;
        setRemaining(d.remaining);
        const total = form.adults + form.children;
        if (d.remaining < total) {
          const newAdults = Math.max(1, Math.min(form.adults, d.remaining));
          setForm((prev) => ({ ...prev, adults: newAdults, children: Math.max(0, d.remaining - newAdults) }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id, form.service_date]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const selectedDay = availability.get(form.service_date);
  const selectedDateStatus = selectedDay?.status;
  const isDateBlocked = selectedDateStatus === 'full' || selectedDateStatus === 'closed';
  const isDateLow = selectedDateStatus === 'low';
  const supportsChildren = option.price_child_usd != null;
  const maxAdults = remaining != null ? Math.min(20, Math.max(1, remaining - form.children)) : 20;
  const maxChildren = remaining != null ? Math.min(20, Math.max(0, remaining - form.adults)) : 20;

  const ticketsUsd = useMemo(() => {
    const adult = option.price_adult_usd * form.adults;
    const child = (option.price_child_usd ?? 0) * form.children;
    return Math.round((adult + child) * 100) / 100;
  }, [option, form.adults, form.children]);

  const transferUsd = useMemo(() => {
    if (!option.has_transfer || !wantsTransfer || !option.transfer_price_usd) return 0;
    return Math.round(option.transfer_price_usd * (form.adults + form.children) * 100) / 100;
  }, [option, wantsTransfer, form.adults, form.children]);

  const totalUsd = Math.round((ticketsUsd + transferUsd) * 100) / 100;

  const updateField = <K extends keyof typeof form>(field: K, value: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Validación manual en vez de la nativa del navegador (los popups por defecto no
  // se pueden estilizar) — el form usa noValidate y este chequeo decide qué mensaje
  // mostrar en el cartel de error ya existente, en el mismo orden en que aparecen los campos.
  const validate = (): string | null => {
    if (form.name.trim().length < 2) return 'Ingresá el nombre completo del pasajero.';
    if (!form.email.trim()) return 'Ingresá el email del pasajero.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Ingresá un email válido.';
    if (!form.nationality) return 'Seleccioná la nacionalidad del pasajero.';
    if (isDateBlocked) {
      if (selectedDateStatus === 'closed') {
        return selectedDay?.reason === 'cutoff'
          ? 'El horario límite de reservas del día ya pasó.'
          : selectedDay?.reason === 'not_operating_day'
            ? 'El servicio no opera ese día de la semana.'
            : 'La casa no opera esa fecha.';
      }
      return 'Sin cupos para esa fecha.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await sellerApi.checkout.create({
        option_id: option.id,
        service_date: form.service_date,
        adults: form.adults,
        children: form.children,
        customer: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          nationality: form.nationality || null,
          dni: form.dni.trim() || null,
        },
        payment_method: paymentMethod,
        transfer_requested: option.has_transfer ? wantsTransfer : false,
        transfer_hotel: (option.has_transfer && wantsTransfer) ? (transferHotel || null) : null,
        transfer_room: (option.has_transfer && wantsTransfer) ? (transferRoom.trim() || null) : null,
      });

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
                Le enviamos el link de pago a <strong className="text-cream/90">{form.email}</strong> para que pague con su propia cuenta o tarjeta.
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

        {/* Aviso de contexto vendedor */}
        <div className="mx-7 mt-5 rounded-lg border border-gold/20 bg-gold/5 px-4 py-3 flex gap-3">
          <span className="text-gold text-base mt-0.5" aria-hidden>✦</span>
          <div className="text-xs text-cream/70 leading-relaxed">
            <strong className="text-cream/90">Estás ingresando esta reserva como vendedor.</strong>{' '}
            La orden quedará marcada como <em>ingresada manualmente</em>.
            Elegí <strong>Efectivo</strong> si el pasajero paga en el momento,
            o <strong>Mercado Pago</strong> para redirigir al pago online.
          </div>
        </div>
        {cutoffTime && (
          <p className="mx-7 mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-xs text-cream/60">
            🕐 Reservas para hoy se toman hasta las <strong className="text-cream/80 ml-1">{cutoffTime}</strong> hs (hora BA)
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="p-7 space-y-5">
          {/* Datos del pasajero */}
          <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Datos del pasajero</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nombre completo" required>
              <input
                type="text" maxLength={120}
                value={form.name} onChange={(e) => updateField('name', e.target.value)}
                className="input" placeholder="Nombre Apellido"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email" maxLength={160}
                value={form.email} onChange={(e) => updateField('email', e.target.value)}
                className="input" placeholder="pasajero@email.com"
              />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <input
                type="tel" maxLength={40}
                value={form.phone} onChange={(e) => updateField('phone', e.target.value)}
                className="input" placeholder="+54 9 11 1234 5678"
              />
            </Field>
            <Field label="DNI / Pasaporte" hint="Opcional — algunas casas piden identificación en la puerta">
              <input
                type="text" maxLength={40}
                value={form.dni} onChange={(e) => updateField('dni', e.target.value)}
                className="input" placeholder="12345678 / AB123456"
                autoComplete="off"
              />
            </Field>
            <Field label="Nacionalidad" required>
              <select
                value={form.nationality} onChange={(e) => updateField('nationality', e.target.value)}
                className="input"
              >
                <option value="">Seleccionar...</option>
                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Fecha del servicio" required>
              <input
                type="date" min={today} max={horizonDate}
                value={form.service_date}
                onChange={(e) => updateField('service_date', e.target.value)}
                className={`input ${isDateBlocked ? 'border-bordeaux-light/60' : ''}`}
              />
              {availabilityLoading && (
                <p className="mt-1 text-xs text-cream/40">Verificando disponibilidad...</p>
              )}
              {!availabilityLoading && selectedDateStatus === 'full' && (
                <p className="mt-1 text-xs text-bordeaux-light">⚠ Sin cupos para esta fecha.</p>
              )}
              {!availabilityLoading && selectedDateStatus === 'closed' && (
                <p className="mt-1 text-xs text-bordeaux-light">
                  ⚠ {selectedDay?.reason === 'cutoff'
                    ? 'El horario límite de reservas del día ya pasó.'
                    : selectedDay?.reason === 'not_operating_day'
                      ? 'El servicio no opera ese día de la semana.'
                      : 'La casa no opera esa fecha.'}
                </p>
              )}
              {!availabilityLoading && isDateLow && (
                <p className="mt-1 text-xs text-gold-soft">
                  ⚡ {selectedDay?.remaining != null
                    ? `Solo quedan ${selectedDay.remaining} lugar${selectedDay.remaining !== 1 ? 'es' : ''}`
                    : 'Quedan pocos lugares.'}
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adultos" required>
                <NumberStepper
                  value={form.adults} min={1} max={maxAdults}
                  onChange={(v) => updateField('adults', v)}
                  cappedMessage={remaining != null ? 'Cupo máximo alcanzado para esta fecha' : undefined}
                />
              </Field>
              {supportsChildren && (
                <Field label="Menores (3-10)">
                  <NumberStepper
                    value={form.children} min={0} max={maxChildren}
                    onChange={(v) => updateField('children', v)}
                    cappedMessage={remaining != null ? 'Cupo máximo alcanzado para esta fecha' : undefined}
                  />
                </Field>
              )}
            </div>
          </div>

          {/* Total */}
          <div className="rounded-lg bg-gold/5 border border-gold/20 p-5">
            {transferUsd > 0 && (
              <div className="space-y-1 mb-3 pb-3 border-b border-gold/15">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-cream/60">Entradas</span>
                  <span className="text-cream/80">USD {ticketsUsd}</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-cream/60">Traslado ({form.adults + form.children} pax)</span>
                  <span className="text-cream/80">+USD {transferUsd}</span>
                </div>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-cream/70">{paymentMethod === 'cash' ? 'Precio sugerido' : 'Total'}</span>
              <span className="font-display text-3xl text-gold">USD {totalUsd}</span>
            </div>
            {paymentMethod === 'cash' ? (
              <>
                <p className="mt-1 text-xs text-cream/50">
                  Es una referencia: al pasajero le cobrás el monto que definas. A nosotros nos rendís solo el neto.
                </p>
                <div className="mt-4 pt-4 border-t border-gold/15">
                  <label className="block">
                    <span className="block text-sm text-cream/80 mb-1.5">
                      ¿Cuánto le cobrás al pasajero? <span className="text-cream/40">(USD · opcional)</span>
                    </span>
                    <input
                      type="number" min={0} step="0.01" inputMode="decimal"
                      value={chargedAmount}
                      onChange={(e) => setChargedAmount(e.target.value)}
                      className="input"
                      placeholder={`Sugerido: ${totalUsd}`}
                    />
                  </label>
                  <p className="mt-1.5 text-xs text-cream/40">
                    Es solo para tu referencia en el momento — no se guarda ni figura en ningún lado.
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-cream/50 text-right">El cobro se procesa en ARS al tipo de cambio vigente.</p>
            )}
          </div>

          {/* Traslado */}
          {option.has_transfer && (
            <TransferSection
              wantsTransfer={wantsTransfer}
              hotel={transferHotel}
              room={transferRoom}
              onToggle={setWantsTransfer}
              onHotelChange={setTransferHotel}
              onRoomChange={setTransferRoom}
              pickupWindow={option.pickup_window_es}
              lang="es"
            />
          )}

          {/* Método de pago */}
          <div className="rounded-lg border border-gold/15 bg-ink/30 p-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-gold-soft">Forma de pago</p>
            {!isPermanent && (
              <div className="rounded-md border border-bordeaux-light/30 bg-bordeaux-deep/20 px-3 py-2 text-xs text-bordeaux-light">
                Tu perfil solo tiene habilitado el pago online. El cobro en efectivo requiere autorización especial.
              </div>
            )}
            <div className={`gap-2 ${isPermanent ? 'grid grid-cols-2' : 'flex'}`}>
              {isPermanent && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                    paymentMethod === 'cash'
                      ? 'border-gold bg-gold/10 text-cream'
                      : 'border-gold/20 text-cream/50 hover:border-gold/40'
                  }`}
                >
                  <span className="block font-medium">Pago al vendedor</span>
                  <span className="text-xs opacity-70">Efectivo en el momento</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPaymentMethod('mercadopago')}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                  isPermanent ? '' : 'flex-1 '
                }${
                  paymentMethod === 'mercadopago'
                    ? 'border-gold bg-gold/10 text-cream'
                    : 'border-gold/20 text-cream/50 hover:border-gold/40'
                }`}
              >
                <span className="block font-medium">Mercado Pago</span>
                <span className="text-xs opacity-70">Tarjeta, transferencia</span>
              </button>
            </div>
            {paymentMethod === 'cash' && isPermanent && (
              <p className="text-xs text-cream/50 pt-1">
                La reserva se ingresa como pendiente. Vos coordinás el cobro con el pasajero.
              </p>
            )}
            {paymentMethod === 'mercadopago' && (
              <p className="text-xs text-cream/50 pt-1">
                Se redirige a Mercado Pago para que el pasajero complete el pago online.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || isDateBlocked}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? <><Spinner size="sm" className="mr-2" />Procesando...</>
              : isDateBlocked
                ? 'Elegí otra fecha'
                : paymentMethod === 'cash'
                  ? 'Confirmar reserva manual'
                  : 'Ir a Mercado Pago'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-cream/80 mb-1.5">
        {label} {required && <span className="text-gold">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1 text-xs text-cream/40">{hint}</p>}
    </label>
  );
}

function NumberStepper({ value, min, max, onChange, cappedMessage }: {
  value: number; min: number; max: number; onChange: (v: number) => void; cappedMessage?: string;
}) {
  const [showCapped, setShowCapped] = useState(false);

  const handleIncrement = () => {
    if (value >= max) {
      setShowCapped(true);
      setTimeout(() => setShowCapped(false), 2500);
      return;
    }
    onChange(Math.min(max, value + 1));
  };

  return (
    <div>
      <div className="flex items-center rounded-md border border-gold/20 bg-ink/40 overflow-hidden">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
          className="px-3 py-2 text-cream hover:bg-gold/10 transition" aria-label="decrement">−</button>
        <span className="flex-1 text-center text-cream tabular-nums">{value}</span>
        <button type="button" onClick={handleIncrement}
          className="px-3 py-2 text-cream hover:bg-gold/10 transition" aria-label="increment">+</button>
      </div>
      {showCapped && cappedMessage && (
        <p className="mt-1 text-xs text-gold-soft">{cappedMessage}</p>
      )}
    </div>
  );
}
