import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type AvailabilityDay } from '../lib/api';
import { getStoredRef } from '../lib/referral';
import type { ProductDetail, ProductOption } from '../types/api';
import { localized } from '../lib/i18nFields';
import TransferSection from './TransferSection';
import { useExchangeRate } from '../lib/useExchangeRate';
import Spinner from './Spinner';
import AvailabilityCalendar from './AvailabilityCalendar';
import Checkbox from './Checkbox';
import NumberStepper from './NumberStepper';
import { computeBookingTotals } from '../lib/pricing';

interface Props {
  product: ProductDetail;
  option: ProductOption;
  onClose: () => void;
  initialPaymentMethod?: 'mercadopago' | 'cash' | 'pix';
  // El vendedor referido tiene cobro en efectivo habilitado — muestra el botón
  // "Al vendedor" en el selector. Si es false, solo quedan tarjeta y PIX.
  showCash: boolean;
  // Tarjeta (Mercado Pago + Pix) habilitada para esta cuenta -- lo decide solo el
  // admin de la plataforma (sellers.card_enabled). Si es false, solo queda pago manual.
  showCard: boolean;
  // Precarga fecha/pasajeros/traslado (ej. vienen de la card de opciones o de
  // "Verificar disponibilidad"). Siguen editables.
  initialDate?: string;
  initialAdults?: number;
  initialChildren?: number;
  initialTransferQty?: number;
  initialInfants?: number;
}

const PixIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
    <path d="M10 2L18 10L10 18L2 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="10" cy="10" r="2" fill="currentColor" />
  </svg>
);

const CreditCardIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
    <rect x="2" y="5" width="16" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2 8.5H18" stroke="currentColor" strokeWidth="1.3" />
    <path d="M4.5 13H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const NATIONALITIES = [
  'Argentina', 'Brasil', 'Estados Unidos', 'Reino Unido', 'España',
  'Italia', 'Francia', 'Alemania', 'Chile', 'Uruguay', 'México', 'Otra',
];

export default function CheckoutForm({ product, option, onClose, initialPaymentMethod, showCash, showCard, initialDate, initialAdults, initialChildren, initialTransferQty, initialInfants }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const exchangeRate = useExchangeRate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedRef = getStoredRef();
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'cash' | 'pix'>(
    initialPaymentMethod ?? (showCard ? 'mercadopago' : 'cash'),
  );
  const [cutoffTime, setCutoffTime] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  // Solo relevante para transfer_mode === 'optional' (el resto de los casos deriva
  // transferQty más abajo: 'included' = todos los pax, 'none' = 0).
  const [transferQtyOptional, setTransferQtyOptional] = useState(() => Math.max(0, initialTransferQty ?? 0));
  const [transferHotel, setTransferHotel] = useState('');
  const [transferRoom, setTransferRoom] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Validación en tiempo real: se marca "touched" recién al salir del campo (blur),
  // para no tirarle un error en la cara al pasajero mientras todavía está escribiendo.
  const [touched, setTouched] = useState<Record<'name' | 'phone' | 'email' | 'nationality', boolean>>({
    name: false, phone: false, email: false, nationality: false,
  });
  const markTouched = (field: keyof typeof touched) => setTouched((prev) => ({ ...prev, [field]: true }));

  const today = new Date().toISOString().slice(0, 10);
  // 3 = fallback mientras carga el valor real configurado en el admin.
  const [horizonMonths, setHorizonMonths] = useState<number | null>(3);
  useEffect(() => {
    api.settings.bookingHorizon().then((d) => setHorizonMonths(d.months)).catch(() => {});
  }, []);
  const horizonDate = useMemo(() => {
    const d = new Date();
    if (horizonMonths == null) d.setFullYear(d.getFullYear() + 5); // "sin tope" → ventana amplia, el server manda la disponibilidad real
    else d.setMonth(d.getMonth() + horizonMonths);
    return d.toISOString().slice(0, 10);
  }, [horizonMonths]);
  const horizonDateLabel = useMemo(() => {
    if (horizonMonths == null) return null;
    const locale = lang === 'en' ? 'en-US' : lang === 'pt' ? 'pt-BR' : 'es-AR';
    return new Date(`${horizonDate}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }, [horizonDate, horizonMonths, lang]);

  const [form, setForm] = useState({
    name: '',
    email: '',
    emailConfirm: '',
    phone: '',
    nationality: '',
    service_date: initialDate ?? today,
    adults: initialAdults ?? 2,
    // Si la casa no acepta menores, arranca en 0 sin importar lo precargado — el campo
    // queda oculto y no tendría cómo editarse (mismo criterio que BookingForm).
    children: (product.accepts_children && option.price_child_usd != null) ? (initialChildren ?? 0) : 0,
    infants: initialInfants ?? 0,
  });

  // Disponibilidad por fecha de la option seleccionada
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
      .catch(() => { /* silencioso, dejamos pasar y validamos en backend */ })
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

  const selectedDay = availability.get(form.service_date);
  const selectedDateStatus = selectedDay?.status;
  const isPastDate = form.service_date < today;
  const isDateBlocked = isPastDate || selectedDateStatus === 'full' || selectedDateStatus === 'closed';
  const isDateLow = selectedDateStatus === 'low';

  const supportsChildren = product.accepts_children && option.price_child_usd != null;
  const maxAdults = remaining != null ? Math.min(20, Math.max(1, remaining - form.children)) : 20;
  const maxChildren = remaining != null ? Math.min(20, Math.max(0, remaining - form.adults)) : 20;

  const totalPax = form.adults + form.children;
  // No puede haber más pax con traslado que pax totales: se recorta solo si adultos
  // o menores bajan por debajo de lo que ya estaba seleccionado.
  useEffect(() => {
    setTransferQtyOptional((v) => Math.min(v, totalPax));
  }, [totalPax]);

  const transferQty = option.transfer_mode === 'included' ? totalPax
    : option.transfer_mode === 'optional' ? transferQtyOptional
    : 0;

  const { ticketsUsd, transferUsd, infantTransferUsd, totalUsd } = useMemo(
    () => computeBookingTotals(option, form.adults, form.children, transferQty, supportsChildren, form.infants),
    [option, form.adults, form.children, transferQty, supportsChildren, form.infants],
  );

  const totalArs = exchangeRate != null ? Math.round(totalUsd * exchangeRate) : null;

  const updateField = <K extends keyof typeof form>(field: K, value: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submitLabel = (() => {
    if (isDateBlocked) return t('checkout.choose_another_date');
    if (paymentMethod === 'cash') return t('checkout.confirm_booking');
    if (paymentMethod === 'pix') return t('checkout.pay_with_pix');
    return t('checkout.pay_with_mp');
  })();

  const checkoutInput = {
    option_id: option.id,
    service_date: form.service_date,
    adults: form.adults,
    children: form.children,
    infants: form.infants,
    customer: {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      nationality: form.nationality || null,
    },
    ref_code: storedRef,
    transfer_qty: transferQty,
    transfer_hotel: transferQty > 0 ? (transferHotel || null) : null,
    transfer_room: transferQty > 0 ? (transferRoom.trim() || null) : null,
    terms_accepted: termsAccepted,
  };

  // Errores por campo — se usan para el feedback en vivo (debajo de cada input,
  // recién visible una vez que el campo fue "touched") y también los reutiliza
  // validate() de abajo para el cartel de error al enviar.
  const nameError = form.name.trim().length < 2 ? t('checkout.name_required') : null;
  const phoneError = !form.phone.trim() ? t('checkout.phone_required') : null;
  const emailError = !form.email.trim()
    ? t('checkout.email_required')
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
      ? t('checkout.email_invalid')
      : null;
  const nationalityError = !form.nationality ? t('checkout.nationality_required') : null;

  // Validación manual en vez de la nativa del navegador (los popups por defecto no
  // se pueden estilizar y quedan inconsistentes entre navegadores) — el form usa
  // noValidate y este chequeo decide qué mensaje mostrar en el cartel de error ya
  // existente, en el mismo orden visual en que aparecen los campos.
  const validate = (): string | null => {
    if (nameError) return nameError;
    if (phoneError) return phoneError;
    if (emailError) return emailError;
    if (form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) return t('checkout.email_mismatch');
    if (nationalityError) return nationalityError;
    if (!termsAccepted) return t('checkout.terms_required');
    if (form.service_date < today) return t('checkout.date_past');
    if (isDateBlocked) {
      if (selectedDateStatus === 'full') return t('checkout.date_full');
      if (selectedDay?.reason === 'cutoff') return t('checkout.date_closed_cutoff');
      if (selectedDay?.reason === 'not_operating_day') return t('checkout.date_closed_day');
      if (selectedDay?.reason === 'beyond_horizon') return t('checkout.date_closed_horizon');
      return t('checkout.date_closed');
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setTouched({ name: true, phone: true, email: true, nationality: true });
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (paymentMethod === 'cash') {
        const response = await api.checkout.createCashOrder(checkoutInput);
        globalThis.location.href = `/checkout/cash?order=${encodeURIComponent(response.order_public_id)}`;
      } else if (paymentMethod === 'pix') {
        const response = await api.checkout.createPixOrder(checkoutInput);
        globalThis.location.href = `/checkout/pix?order=${encodeURIComponent(response.order_public_id)}`;
      } else {
        const response = await api.checkout.createPreference(checkoutInput);
        globalThis.location.href = response.init_point;
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
      <div className="relative w-full max-w-2xl rounded-2xl bg-ink-soft border border-gold/20 animate-modal-panel">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
        >
          ×
        </button>

        <div className="p-7 border-b border-gold/10">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
            {product.venue_name}
          </p>
          <h2 className="mt-2 font-display text-3xl text-cream">
            {localized(option, 'name', lang)}
          </h2>
          {cutoffTime && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-xs text-cream/60">
              🕐 {t('checkout.cutoff_notice', { time: cutoffTime })}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-7 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('checkout.name')} required>
              <input
                type="text" maxLength={120}
                value={form.name} onChange={(e) => updateField('name', e.target.value)}
                onBlur={() => markTouched('name')}
                className={`input ${touched.name && nameError ? 'border-bordeaux-light/60' : ''}`}
                autoComplete="name"
              />
              {touched.name && nameError && (
                <p className="mt-1 text-xs text-bordeaux-light">⚠ {nameError}</p>
              )}
            </Field>
            <Field label={t('checkout.phone')} required>
              <input
                type="tel" maxLength={40}
                value={form.phone} onChange={(e) => updateField('phone', e.target.value)}
                onBlur={() => markTouched('phone')}
                className={`input ${touched.phone && phoneError ? 'border-bordeaux-light/60' : ''}`}
                placeholder="+54 9 11 1234 5678"
                autoComplete="tel"
              />
              {touched.phone && phoneError && (
                <p className="mt-1 text-xs text-bordeaux-light">⚠ {phoneError}</p>
              )}
            </Field>
            <Field label={t('checkout.email')} required>
              <input
                type="email" maxLength={160}
                value={form.email} onChange={(e) => updateField('email', e.target.value)}
                onBlur={() => markTouched('email')}
                className={`input ${touched.email && emailError ? 'border-bordeaux-light/60' : ''}`}
                autoComplete="email"
              />
              {touched.email && emailError && (
                <p className="mt-1 text-xs text-bordeaux-light">⚠ {emailError}</p>
              )}
            </Field>
            <Field label={t('checkout.email_confirm')} required>
              <input
                type="email" maxLength={160}
                value={form.emailConfirm} onChange={(e) => updateField('emailConfirm', e.target.value)}
                className={`input ${form.emailConfirm && form.emailConfirm.trim().toLowerCase() !== form.email.trim().toLowerCase() ? 'border-bordeaux-light/60' : ''}`}
                autoComplete="off"
                onPaste={(e) => e.preventDefault()}
              />
              {form.emailConfirm && form.emailConfirm.trim().toLowerCase() !== form.email.trim().toLowerCase() && (
                <p className="mt-1 text-xs text-bordeaux-light">⚠ {t('checkout.email_mismatch')}</p>
              )}
            </Field>
            <div className="sm:col-span-2 rounded-lg bg-gold/5 border border-gold/20 px-4 py-3 flex gap-3 items-start">
              <span className="text-gold mt-0.5 text-base leading-none">✉</span>
              <p className="text-xs text-cream/70 leading-relaxed">{t('checkout.contact_info_notice')}</p>
            </div>
            <Field label={t('checkout.nationality')} required>
              <select
                value={form.nationality} onChange={(e) => updateField('nationality', e.target.value)}
                onBlur={() => markTouched('nationality')}
                className={`input ${touched.nationality && nationalityError ? 'border-bordeaux-light/60' : ''}`}
              >
                <option value="">{t('checkout.select')}</option>
                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {touched.nationality && nationalityError && (
                <p className="mt-1 text-xs text-bordeaux-light">⚠ {nationalityError}</p>
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t('checkout.service_date')} required
                hint={horizonDateLabel ? t('checkout.horizon_notice', { date: horizonDateLabel }) : undefined}
              >
                <AvailabilityCalendar
                  optionId={option.id}
                  value={form.service_date}
                  currentDate={form.service_date}
                  onChange={(date) => updateField('service_date', date)}
                />
              </Field>
              {availabilityLoading && (
                <p className="mt-1 text-xs text-cream/40">{t('checkout.checking_availability')}</p>
              )}
              {!availabilityLoading && selectedDateStatus === 'full' && (
                <p className="mt-1 text-xs text-bordeaux-light">⚠ {t('checkout.date_full')}</p>
              )}
              {!availabilityLoading && selectedDateStatus === 'closed' && (
                <p className="mt-1 text-xs text-bordeaux-light">
                  ⚠ {selectedDay?.reason === 'cutoff'
                    ? t('checkout.date_closed_cutoff')
                    : selectedDay?.reason === 'not_operating_day'
                      ? t('checkout.date_closed_day')
                      : selectedDay?.reason === 'beyond_horizon'
                        ? t('checkout.date_closed_horizon')
                        : t('checkout.date_closed')}
                </p>
              )}
              {!availabilityLoading && isDateLow && (
                <p className="mt-1 text-xs text-gold-soft">
                  ⚡ {selectedDay?.remaining != null
                    ? `Solo quedan ${selectedDay.remaining} lugar${selectedDay.remaining !== 1 ? 'es' : ''}`
                    : t('checkout.date_low')}
                </p>
              )}
            </div>
            <div className={`grid gap-3 ${supportsChildren ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
              <Field label={t('checkout.adults')} required>
                <NumberStepper
                  value={form.adults} min={1} max={maxAdults}
                  onChange={(v) => updateField('adults', v)}
                  cappedMessage={remaining != null ? t('checkout.capacity_max_reached') : undefined}
                />
              </Field>
              {supportsChildren && (
                <Field label={product.children_age_label ? `${t('checkout.children')} (${product.children_age_label})` : t('checkout.children')}>
                  <NumberStepper
                    value={form.children} min={0} max={maxChildren}
                    onChange={(v) => updateField('children', v)}
                    cappedMessage={remaining != null ? t('checkout.capacity_max_reached') : undefined}
                  />
                </Field>
              )}
              <Field label={product.infant_age_label ? `${t('checkout.infants')} (${product.infant_age_label})` : t('checkout.infants')}>
                <NumberStepper
                  value={form.infants} min={0} max={20}
                  onChange={(v) => updateField('infants', v)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg bg-gold/5 border border-gold/20 p-5">
            {transferUsd > 0 && (
              <div className="space-y-1 mb-3 pb-3 border-b border-gold/15">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-cream/60">{t('checkout.tickets')}</span>
                  <span className="text-cream/80">USD {ticketsUsd}</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-cream/60">{t('checkout.transfer')} ({transferQty} pax)</span>
                  <span className="text-cream/80">+ USD {transferUsd}</span>
                </div>
                {infantTransferUsd > 0 && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-cream/60">{t('checkout.transfer')} ({t('checkout.infants').toLowerCase()})</span>
                    <span className="text-cream/80">+ USD {infantTransferUsd}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm text-cream/70 pt-2">{t('checkout.total')}</span>
              <div className="text-right">
                <p className="font-display text-3xl text-gold">USD {totalUsd}</p>
                {totalArs != null && (
                  <p className="text-xs text-cream/50 mt-1">
                    ≈ ARS {Math.round(totalArs).toLocaleString('en-US')}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gold/10 flex gap-2 items-start">
              <span className="text-gold-soft shrink-0 leading-none mt-0.5">💱</span>
              <p className="text-xs text-cream/60 leading-relaxed">{t(showCard ? 'checkout.currency_notice_card' : 'checkout.currency_notice_cash_only')}</p>
            </div>
          </div>

          {/* Traslado — solo si la option lo tiene (opcional u incluido) */}
          {option.transfer_mode !== 'none' && (
            <TransferSection
              qty={transferQtyOptional}
              maxQty={totalPax}
              hotel={transferHotel}
              room={transferRoom}
              onChange={setTransferQtyOptional}
              onHotelChange={setTransferHotel}
              onRoomChange={setTransferRoom}
              pickupWindow={lang === 'en' ? option.pickup_window_en : option.pickup_window_es}
              lang={lang === 'en' ? 'en' : 'es'}
              included={option.transfer_mode === 'included'}
            />
          )}

          {/* Selector de método de pago — siempre visible, sin importar desde dónde se
              abrió el formulario (tier card o resumen), para que quien no vio el resumen
              (típico en mobile, si no bajó hasta el final) igual pueda elegir acá. */}
          <div className="rounded-lg border border-gold/15 bg-ink/30 p-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-gold-soft">{t('checkout.payment_method')}</p>
            <div className={`grid gap-2 ${(showCard ? 2 : 0) + (showCash ? 1 : 0) >= 3 ? 'grid-cols-1 sm:grid-cols-3' : (showCard ? 2 : 0) + (showCash ? 1 : 0) === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {showCard && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mercadopago')}
                  className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                    paymentMethod === 'mercadopago'
                      ? 'border-gold bg-gold/10 text-cream'
                      : 'border-gold/20 text-cream/50 hover:border-gold/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium">{CreditCardIcon}{t('payment_methods.card_brands')}</span>
                </button>
              )}
              {showCard && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('pix')}
                  className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                    paymentMethod === 'pix'
                      ? 'border-[#32BCAD] bg-[#32BCAD]/10 text-cream'
                      : 'border-[#32BCAD]/25 text-cream/50 hover:border-[#32BCAD]/50'
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium">{PixIcon}PIX</span>
                  <span className="text-xs opacity-70">{t('payment_methods.pix_short')}</span>
                </button>
              )}
              {showCash && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                    paymentMethod === 'cash'
                      ? 'border-gold bg-gold/10 text-cream'
                      : 'border-gold/20 text-cream/50 hover:border-gold/40'
                  }`}
                >
                  <span className="block font-medium">{t('payment_methods.cash_label')}</span>
                  <span className="text-xs opacity-70">{t('payment_methods.cash_short')}</span>
                </button>
              )}
            </div>
            {paymentMethod === 'cash' && showCash && (
              <p className="text-xs text-cream/50 pt-1">{t('checkout.cash_note')}</p>
            )}
            {paymentMethod === 'pix' && (
              <p className="text-xs text-cream/50 pt-1">{t('checkout.pix_note')}</p>
            )}
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox id="checkout-terms" checked={termsAccepted} onChange={setTermsAccepted} className="mt-0.5" />
            <label htmlFor="checkout-terms" className="text-sm text-cream/70 cursor-pointer select-none">
              {t('checkout.terms_prefix')}{' '}
              <a
                href="/terminos-y-condiciones"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-gold underline decoration-gold/40 hover:text-gold-soft"
              >
                {t('nav.terms')}
              </a>
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || isDateBlocked || !termsAccepted}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Spinner size="sm" className="mr-2" />{t('checkout.processing')}</>
            ) : submitLabel}
          </button>

          {paymentMethod === 'mercadopago' && (
            <p className="text-xs text-cream/40 text-center">{t('checkout.mp_redirect_note')}</p>
          )}
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
