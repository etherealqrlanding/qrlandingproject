import { useEffect, useMemo, useState } from 'react';
import { api, type AvailabilityDay } from '../../lib/api';
import type { SellerBookingInput } from '../../lib/sellerApi';
import type { ProductOption } from '../../types/api';
import TransferSection from '../TransferSection';
import Spinner from '../Spinner';
import AvailabilityCalendar from '../AvailabilityCalendar';
import NumberStepper from '../NumberStepper';
import { computeBookingTotals } from '../../lib/pricing';

// Núcleo del formulario de reserva manual: datos del pasajero, disponibilidad en vivo,
// cálculo de precios, traslado y método de pago. Lo comparten el portal de vendedores
// (SellerBookingModal) y el admin (AdminBookingModal) — cada uno decide qué pasa con el
// payload validado vía onValidSubmit: el vendedor lo manda directo a la API, el admin lo
// lleva primero a un paso de confirmación (elige quién dispara la llamada de red).
export interface BookingFormTotals {
  ticketsUsd: number;
  transferUsd: number;
  infantTransferUsd: number;
  totalUsd: number;
}

export interface BookingFormProps {
  option: ProductOption;
  // Política de menores de la CASA (no del tier) — el tier solo aporta el precio.
  productAcceptsChildren: boolean;
  childrenAgeLabel?: string | null;
  allowCash: boolean;
  // Tarjeta (Mercado Pago + Pix) habilitada para esta cuenta -- lo decide solo el
  // admin de la plataforma (sellers.card_enabled), nunca el vendedor ni el admin de cuenta.
  allowCard: boolean;
  contextBanner: React.ReactNode;
  submitLabels: { cash: string; mercadopago: string; pix: string };
  submitting: boolean;
  externalError?: string | null;
  // Precarga la fecha del servicio (ej. viene de "Verificar disponibilidad") en vez de
  // arrancar siempre en hoy. Igual queda editable — el vendedor puede cambiarla.
  initialDate?: string;
  // Precarga la cantidad de pasajeros (misma fuente). Siguen editables.
  initialAdults?: number;
  initialChildren?: number;
  onValidSubmit: (payload: SellerBookingInput, totals: BookingFormTotals) => void;
}

const NATIONALITIES = [
  'Argentina', 'Brasil', 'Estados Unidos', 'Reino Unido', 'España',
  'Italia', 'Francia', 'Alemania', 'Chile', 'Uruguay', 'México', 'Otra',
];

export default function BookingForm({
  option, productAcceptsChildren, childrenAgeLabel, allowCash, allowCard, contextBanner, submitLabels, submitting, externalError, initialDate, initialAdults, initialChildren, onValidSubmit,
}: BookingFormProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'cash' | 'pix'>(
    allowCash ? 'cash' : (allowCard ? 'mercadopago' : 'cash'),
  );
  const [cutoffTime, setCutoffTime] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  // Solo relevante para transfer_mode === 'optional' ('included' = todos los pax,
  // 'none' = 0, derivados más abajo).
  const [transferQtyOptional, setTransferQtyOptional] = useState(0);
  const [transferHotel, setTransferHotel] = useState('');
  const [transferRoom, setTransferRoom] = useState('');
  // Monto que se le cobra al pasajero en efectivo. Es SOLO referencia visual para el
  // momento del cobro: no se envía al backend ni se guarda en ningún lado.
  const [chargedAmount, setChargedAmount] = useState('');

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

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    nationality: '',
    service_date: initialDate ?? today,
    adults: initialAdults ?? 2,
    // Si la casa no acepta menores, arranca en 0 sin importar lo que venga precargado —
    // el campo queda oculto y no tendría cómo editarse.
    children: productAcceptsChildren ? (initialChildren ?? 0) : 0,
    infants: 0,
  });
  // Solo para validar que no haya un typo en el mail del pasajero — no se envía al backend.
  const [emailConfirm, setEmailConfirm] = useState('');

  const [availability, setAvailability] = useState<Map<string, AvailabilityDay>>(new Map());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

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

  const selectedDay = availability.get(form.service_date);
  const selectedDateStatus = selectedDay?.status;
  const isDateBlocked = selectedDateStatus === 'full' || selectedDateStatus === 'closed';
  const isDateLow = selectedDateStatus === 'low';
  const supportsChildren = productAcceptsChildren && option.price_child_usd != null;
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

  const updateField = <K extends keyof typeof form>(field: K, value: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Validación manual en vez de la nativa del navegador (los popups por defecto no
  // se pueden estilizar) — el form usa noValidate y este chequeo decide qué mensaje
  // mostrar en el cartel de error ya existente, en el mismo orden en que aparecen los campos.
  // Cada error trae el id del campo que lo causó, para poder hacerle scroll + foco.
  const validate = (): { message: string; fieldId: string } | null => {
    if (form.name.trim().length < 2) return { message: 'Ingresá el nombre completo del pasajero.', fieldId: 'bf-name' };
    if (!form.email.trim()) return { message: 'Ingresá el email del pasajero.', fieldId: 'bf-email' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return { message: 'Ingresá un email válido.', fieldId: 'bf-email' };
    if (form.email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      return { message: 'El email y su confirmación no coinciden.', fieldId: 'bf-email-confirm' };
    }
    if (form.phone.trim() && !/^\d{8,15}$/.test(form.phone.trim())) {
      return { message: 'El teléfono debe tener solo números, sin "+", espacios ni guiones (ej: 5491132368312).', fieldId: 'bf-phone' };
    }
    if (!form.nationality) return { message: 'Seleccioná la nacionalidad del pasajero.', fieldId: 'bf-nationality' };
    if (isDateBlocked) {
      if (selectedDateStatus === 'closed') {
        return {
          fieldId: 'bf-date',
          message: selectedDay?.reason === 'cutoff'
            ? 'El horario límite de reservas del día ya pasó.'
            : selectedDay?.reason === 'not_operating_day'
              ? 'El servicio no opera ese día de la semana.'
              : 'La casa no opera esa fecha.',
        };
      }
      return { message: 'Sin cupos para esa fecha.', fieldId: 'bf-date' };
    }
    return null;
  };

  // Lleva la vista (y el foco, si aplica) hasta el campo que falló la validación —
  // el form puede ser largo y sin esto el vendedor no siempre nota qué le falta.
  const scrollToField = (fieldId: string) => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError.message);
      scrollToField(validationError.fieldId);
      return;
    }
    setLocalError(null);
    onValidSubmit({
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
      payment_method: paymentMethod,
      transfer_qty: transferQty,
      transfer_hotel: transferQty > 0 ? (transferHotel || null) : null,
      transfer_room: transferQty > 0 ? (transferRoom.trim() || null) : null,
    }, { ticketsUsd, transferUsd, infantTransferUsd, totalUsd });
  };

  const error = localError ?? externalError ?? null;

  return (
    <>
      {contextBanner}
      {cutoffTime && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/5 px-3 py-1 text-xs text-cream/60">
          🕐 Reservas para hoy se toman hasta las <strong className="text-cream/80 ml-1">{cutoffTime}</strong> hs (hora BA)
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
        {/* Datos del pasajero */}
        <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Datos del pasajero</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nombre completo" required>
            <input
              id="bf-name"
              type="text" maxLength={120}
              value={form.name} onChange={(e) => updateField('name', e.target.value)}
              className="input" placeholder="Nombre Apellido"
            />
          </Field>
          <Field label="Email" required>
            <input
              id="bf-email"
              type="email" maxLength={160}
              value={form.email} onChange={(e) => updateField('email', e.target.value)}
              className="input" placeholder="pasajero@email.com"
            />
          </Field>
          <Field label="Confirmar email" required hint="Volvé a escribirlo — no se puede pegar, para evitar errores de tipeo.">
            <input
              id="bf-email-confirm"
              type="email" maxLength={160}
              value={emailConfirm} onChange={(e) => setEmailConfirm(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              className="input" placeholder="pasajero@email.com"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Teléfono / WhatsApp"
            hint={'Sin "+" ni espacios ni guiones: código de país + código de área (sin el 0) + número (sin el 15). Ej: Buenos Aires → 5491132368312.'}
          >
            <input
              id="bf-phone"
              type="tel" maxLength={40}
              value={form.phone} onChange={(e) => updateField('phone', e.target.value)}
              className="input" placeholder="5491132368312"
            />
          </Field>
          <Field label="Nacionalidad" required>
            <select
              id="bf-nationality"
              value={form.nationality} onChange={(e) => updateField('nationality', e.target.value)}
              className="input"
            >
              <option value="">Seleccionar...</option>
              {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2" id="bf-date">
            <Field label="Fecha del servicio" required>
              <AvailabilityCalendar
                optionId={option.id}
                value={form.service_date}
                currentDate={form.service_date}
                onChange={(date) => updateField('service_date', date)}
              />
            </Field>
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
          </div>
          <div className={`grid gap-3 ${supportsChildren ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
            <Field label="Adultos" required>
              <NumberStepper
                value={form.adults} min={1} max={maxAdults}
                onChange={(v) => updateField('adults', v)}
                cappedMessage={remaining != null ? 'Cupo máximo alcanzado para esta fecha' : undefined}
              />
            </Field>
            {supportsChildren && (
              <Field label={childrenAgeLabel ? `Menores (${childrenAgeLabel})` : 'Menores'}>
                <NumberStepper
                  value={form.children} min={0} max={maxChildren}
                  onChange={(v) => updateField('children', v)}
                  cappedMessage={remaining != null ? 'Cupo máximo alcanzado para esta fecha' : undefined}
                />
              </Field>
            )}
            <Field label="Infantes">
              <NumberStepper
                value={form.infants} min={0} max={20}
                onChange={(v) => updateField('infants', v)}
              />
            </Field>
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
              {infantTransferUsd > 0 && (
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-cream/60">Traslado (infantes)</span>
                  <span className="text-cream/80">+USD {infantTransferUsd}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-cream/70">{paymentMethod === 'cash' ? 'Precio sugerido' : 'Total'}</span>
            <span className="font-display text-3xl text-gold">USD {totalUsd}</span>
          </div>
          {paymentMethod === 'pix' && (
            <p className="mt-1 text-xs text-cream/50 text-right">El cobro se procesa en reales (BRL) por PIX.</p>
          )}
          {paymentMethod === 'cash' ? (
            <>
              <p className="mt-1 text-xs text-cream/50">
                Es una referencia: al pasajero se le cobra el monto que se defina. A nosotros se rinde solo el neto.
              </p>
              <div className="mt-4 pt-4 border-t border-gold/15">
                <label className="block">
                  <span className="block text-sm text-cream/80 mb-1.5">
                    ¿Cuánto se le cobra al pasajero? <span className="text-cream/40">(USD · opcional)</span>
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
                  Es solo para referencia en el momento del cobro — no se guarda ni figura en ningún lado.
                </p>
              </div>
            </>
          ) : paymentMethod === 'mercadopago' ? (
            <p className="mt-1 text-xs text-cream/50 text-right">El cobro se procesa en ARS al tipo de cambio vigente.</p>
          ) : null}
        </div>

        {/* Traslado */}
        {option.transfer_mode !== 'none' && (
          <TransferSection
            qty={transferQtyOptional}
            maxQty={totalPax}
            hotel={transferHotel}
            room={transferRoom}
            onChange={setTransferQtyOptional}
            onHotelChange={setTransferHotel}
            onRoomChange={setTransferRoom}
            pickupWindow={option.pickup_window_es}
            lang="es"
            included={option.transfer_mode === 'included'}
          />
        )}

        {/* Método de pago */}
        <div className="rounded-lg border border-gold/15 bg-ink/30 p-4 space-y-2">
          <p className="text-xs uppercase tracking-widest text-gold-soft">Forma de pago</p>
          {!allowCash && allowCard && (
            <div className="rounded-md border border-bordeaux-light/30 bg-bordeaux-deep/20 px-3 py-2 text-xs text-bordeaux-light">
              Este recomendador solo tiene habilitado el pago online. El cobro en efectivo requiere autorización especial.
            </div>
          )}
          {!allowCard && (
            <div className="rounded-md border border-bordeaux-light/30 bg-bordeaux-deep/20 px-3 py-2 text-xs text-bordeaux-light">
              Este recomendador no tiene habilitado el cobro con tarjeta. Solo se puede cargar pago manual.
            </div>
          )}
          <div className={`grid gap-2 ${(allowCash ? 1 : 0) + (allowCard ? 2 : 0) >= 3 ? 'grid-cols-1 sm:grid-cols-3' : (allowCash ? 1 : 0) + (allowCard ? 2 : 0) === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {allowCash && (
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                  paymentMethod === 'cash'
                    ? 'border-gold bg-gold/10 text-cream'
                    : 'border-gold/20 text-cream/50 hover:border-gold/40'
                }`}
              >
                <span className="block font-medium">Pago al recomendador</span>
                <span className="text-xs opacity-70">Efectivo en el momento</span>
              </button>
            )}
            {allowCard && (
              <button
                type="button"
                onClick={() => setPaymentMethod('mercadopago')}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                  paymentMethod === 'mercadopago'
                    ? 'border-gold bg-gold/10 text-cream'
                    : 'border-gold/20 text-cream/50 hover:border-gold/40'
                }`}
              >
                <span className="block font-medium">Mercado Pago</span>
                <span className="text-xs opacity-70">Tarjeta, transferencia</span>
              </button>
            )}
            {allowCard && (
              <button
                type="button"
                onClick={() => setPaymentMethod('pix')}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition ${
                  paymentMethod === 'pix'
                    ? 'border-[#32BCAD] bg-[#32BCAD]/10 text-cream'
                    : 'border-[#32BCAD]/25 text-cream/50 hover:border-[#32BCAD]/50'
                }`}
              >
                <span className="block font-medium">PIX</span>
                <span className="text-xs opacity-70">En reales (BRL)</span>
              </button>
            )}
          </div>
          {paymentMethod === 'cash' && allowCash && (
            <p className="text-xs text-cream/50 pt-1">
              La reserva se ingresa como pendiente. El recomendador coordina el cobro con el pasajero.
            </p>
          )}
          {paymentMethod === 'mercadopago' && (
            <p className="text-xs text-cream/50 pt-1">
              Se le envía al pasajero por email el link de Mercado Pago para completar el pago online.
            </p>
          )}
          {paymentMethod === 'pix' && (
            <p className="text-xs text-cream/50 pt-1">
              Se le envía al pasajero por email el link para pagar con PIX en reales (QR o clave copia e cola).
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
                ? submitLabels.cash
                : paymentMethod === 'pix'
                  ? submitLabels.pix
                  : submitLabels.mercadopago}
        </button>
      </form>
    </>
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
