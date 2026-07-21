import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { adminApi, AdminApiError, type AdminBookingResult, type AdminSeller } from '../../lib/adminApi';
import type { SellerBookingInput } from '../../lib/sellerApi';
import type { ProductDetail, ProductOption, ProductSummary } from '../../types/api';
import BookingForm, { type BookingFormTotals } from '../booking/BookingForm';
import { OptionInfoCard } from '../seller/OptionInfoCard';
import Spinner from '../Spinner';

interface Props {
  onClose: () => void;
  // Se llama apenas la orden queda creada (antes de que el admin navegue a verla), para
  // que la pantalla que abrió el modal pueda refrescar su lista en segundo plano.
  onCreated?: () => void;
}

// Reserva manual creada por el equipo y asignada a un vendedor puntual (típicamente
// porque el vendedor se lo pidió al equipo). Wizard de 3 pantallas — elegir vendedor,
// elegir show, completar el formulario — y una confirmación explícita antes de crear
// la orden, para no atribuírsela por error a otro vendedor. El "vendedor asignado"
// queda siempre visible en pantalla desde que se elige hasta que se confirma.
export default function AdminBookingModal({ onClose, onCreated }: Props) {
  const navigate = useNavigate();

  // Paso 1: vendedor
  const [sellers, setSellers] = useState<AdminSeller[] | null>(null);
  const [sellerListError, setSellerListError] = useState<string | null>(null);
  const [sellerFilter, setSellerFilter] = useState('');
  const [selectedSeller, setSelectedSeller] = useState<AdminSeller | null>(null);

  useEffect(() => {
    adminApi.sellers.list()
      // ADMINPREVIEW es el código interno de "Ver sitio en vivo" (services/admin/index.ts) —
      // no es un vendedor real, no debería poder atribuírsele una reserva.
      .then((rows) => setSellers(rows.filter((s) => s.is_active && s.code !== 'ADMINPREVIEW')))
      .catch((err) => setSellerListError((err as Error).message));
  }, []);

  // Paso 2: catálogo — mismo patrón que SellerBooking.tsx (acordeón show → opciones)
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.products.list()
      .then(setProducts)
      .catch((err) => setCatalogError((err as Error).message))
      .finally(() => setCatalogLoading(false));
  }, []);

  const handleToggle = async (slug: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedSlug(slug);
    setExpandedDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await api.products.bySlug(slug);
      setExpandedDetail(detail);
    } catch {
      setExpandedSlug(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Paso 3: formulario + confirmación
  const [booking, setBooking] = useState<{ product: ProductDetail; option: ProductOption } | null>(null);
  const [pending, setPending] = useState<{ payload: SellerBookingInput; totals: BookingFormTotals } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminBookingResult | null>(null);

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

  const handleValidSubmit = (payload: SellerBookingInput, totals: BookingFormTotals) => {
    setConfirmError(null);
    setPending({ payload, totals });
  };

  const handleConfirm = async () => {
    if (!pending || !selectedSeller) return;
    setConfirmSubmitting(true);
    setConfirmError(null);
    try {
      const res = await adminApi.orders.create({ ...pending.payload, seller_id: selectedSeller.id });
      setResult(res);
      onCreated?.();
    } catch (err) {
      setConfirmError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const resetForAnother = () => {
    setResult(null);
    setPending(null);
    setBooking(null);
    setExpandedSlug(null);
    setExpandedDetail(null);
  };

  const viewOrder = () => {
    if (!result) return;
    onClose();
    navigate(`/admin/orders?highlight=${encodeURIComponent(result.order_public_id)}`);
  };

  const filteredSellers = (sellers ?? []).filter((s) => {
    const q = sellerFilter.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
  });

  // ── Éxito ──────────────────────────────────────────────────
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/85 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gold" aria-hidden>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="font-display text-2xl text-cream mb-2">¡Reserva creada!</h2>
          <p className="text-sm text-cream/60 mb-1">
            Ref. <span className="font-mono text-gold-soft">{result.order_public_id.slice(0, 8).toUpperCase()}</span>
          </p>
          <p className="text-sm text-cream/70 mb-6">
            Quedó asignada a <strong className="text-cream/90">{result.seller.name} ({result.seller.code})</strong>.{' '}
            {result.payment_method === 'cash'
              ? 'El vendedor va a coordinar el cobro en efectivo y marcarla como Cobrada desde su portal.'
              : 'Le enviamos el link de pago al pasajero — la comisión se acredita cuando pague.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={viewOrder}
              className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
            >
              Ver orden
            </button>
            <button
              onClick={resetForAnother}
              className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors"
            >
              Cargar otra reserva
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Paso 1: elegir vendedor ────────────────────────────────
  if (!selectedSeller) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm">
        <div className="min-h-full flex items-start justify-center p-4 py-8">
          <div className="relative w-full max-w-lg rounded-2xl bg-ink-soft border border-gold/20 p-7">
            <button
              type="button" onClick={onClose} aria-label="Cerrar"
              className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
            >
              ×
            </button>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Nueva reserva manual</p>
            <h2 className="mt-2 font-display text-2xl text-cream">¿A qué vendedor se asigna?</h2>
            <p className="mt-2 text-sm text-cream/60">
              La reserva, su comisión y su historial van a quedar atribuidos a este vendedor.
            </p>

            <input
              type="text" value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}
              placeholder="Buscar por nombre o código..."
              className="input mt-4"
            />

            {sellerListError && (
              <div className="mt-4 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
                {sellerListError}
              </div>
            )}

            {sellers === null ? (
              <div className="mt-4 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-ink/40 animate-pulse" />)}
              </div>
            ) : (
              <ul className="mt-4 max-h-96 overflow-y-auto space-y-2">
                {filteredSellers.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSeller(s)}
                      className="w-full text-left rounded-lg border border-gold/15 bg-ink/30 px-4 py-3 hover:border-gold/40 hover:bg-gold/5 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-cream truncate">{s.name}</span>
                        <span className="text-xs font-mono text-gold-soft shrink-0">{s.code}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cream/50">
                        <span>{s.commission_percent}% comisión</span>
                        {s.is_permanent && <span className="text-emerald-400/80">Efectivo habilitado</span>}
                      </div>
                    </button>
                  </li>
                ))}
                {filteredSellers.length === 0 && (
                  <p className="text-sm text-cream/40 text-center py-6">Ningún vendedor coincide con la búsqueda.</p>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  const sellerBadge = (
    <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-gold-soft">Vendedor asignado</p>
        <p className="text-sm text-cream font-medium truncate">
          {selectedSeller.name} <span className="font-mono text-gold-soft">({selectedSeller.code})</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => { setSelectedSeller(null); setBooking(null); setPending(null); }}
        className="shrink-0 text-xs text-cream/50 hover:text-cream underline underline-offset-2"
      >
        Cambiar
      </button>
    </div>
  );

  // ── Paso 2: elegir show/opción ─────────────────────────────
  if (!booking) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm">
        <div className="min-h-full flex items-start justify-center p-4 py-8">
          <div className="relative w-full max-w-2xl rounded-2xl bg-ink-soft border border-gold/20 p-7">
            <button
              type="button" onClick={onClose} aria-label="Cerrar"
              className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
            >
              ×
            </button>
            <div className="mb-4">{sellerBadge}</div>
            <h2 className="font-display text-2xl text-cream mb-4">Elegí el show</h2>

            {catalogError && (
              <div className="mb-4 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
                {catalogError}
              </div>
            )}

            {catalogLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-ink-soft/60 animate-pulse" />)}
              </div>
            ) : products.length === 0 ? (
              <p className="text-cream/40 text-sm py-10 text-center">No hay shows disponibles.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {products.map((product) => {
                  const isExpanded = expandedSlug === product.slug;
                  return (
                    <div
                      key={product.id}
                      className={`rounded-xl border overflow-hidden transition-colors ${
                        isExpanded ? 'border-gold/25 bg-ink-soft/60' : 'border-gold/10 bg-ink-soft/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggle(product.slug)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gold/5 transition"
                      >
                        {product.hero_image && (
                          <img src={product.hero_image} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0 border border-gold/10" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-cream font-semibold">{product.name}</p>
                          <p className="text-xs text-gold-soft">{product.venue_name}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {product.starting_price_usd != null && (
                            <span className="text-gold text-sm font-display">desde USD {product.starting_price_usd}</span>
                          )}
                          <span className={`text-cream/40 text-sm transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gold/10 px-5 py-4 space-y-3">
                          {loadingDetail ? (
                            <div className="space-y-2">
                              {[1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-ink-soft/60 animate-pulse" />)}
                            </div>
                          ) : expandedDetail ? (
                            expandedDetail.options.length === 0 ? (
                              <p className="text-sm text-cream/40">Sin opciones disponibles.</p>
                            ) : (
                              expandedDetail.options.map((opt) => (
                                <OptionInfoCard
                                  key={opt.id}
                                  option={opt}
                                  onBook={() => setBooking({ product: expandedDetail, option: opt })}
                                />
                              ))
                            )
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Paso 3: formulario + confirmación ──────────────────────
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="relative w-full max-w-2xl rounded-2xl bg-ink-soft border border-gold/20">
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
          >
            ×
          </button>

          <div className="p-7 border-b border-gold/10">
            <button
              type="button"
              onClick={() => { setBooking(null); setPending(null); }}
              className="text-xs text-cream/50 hover:text-cream mb-3"
            >
              ← Cambiar show
            </button>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">{booking.product.venue_name}</p>
            <h2 className="mt-1 font-display text-3xl text-cream">{booking.option.name_es}</h2>
          </div>

          <div className="p-7 space-y-5">
            {sellerBadge}
            <BookingForm
              option={booking.option}
              allowCash={selectedSeller.is_permanent}
              submitting={false}
              submitLabels={{ cash: 'Revisar y confirmar', mercadopago: 'Revisar y confirmar' }}
              onValidSubmit={handleValidSubmit}
              contextBanner={(
                <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 md:p-4 flex gap-3">
                  <span className="text-gold text-base mt-0.5" aria-hidden>✦</span>
                  <div className="text-xs text-cream/70 leading-relaxed">
                    <strong className="text-cream/90">Reserva manual del equipo.</strong>{' '}
                    Antes de crearla vas a poder revisar un resumen con el vendedor asignado.
                  </div>
                </div>
              )}
            />
          </div>

          {pending && (
            <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto rounded-2xl bg-ink/95 backdrop-blur-sm p-4 py-8">
              <div className="w-full max-w-md rounded-xl border border-gold/30 bg-ink-soft p-6">
                <p className="text-xs uppercase tracking-widest text-gold-soft mb-3">Confirmá antes de crear la reserva</p>

                <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-gold-soft">Vendedor asignado</p>
                  <p className="font-display text-xl text-gold">
                    {selectedSeller.name} <span className="text-sm font-mono text-gold-soft">({selectedSeller.code})</span>
                  </p>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <SummaryRow label="Pasajero" value={pending.payload.customer.name} />
                  <SummaryRow label="Show" value={`${booking.product.venue_name} — ${booking.option.name_es}`} />
                  <SummaryRow label="Fecha" value={pending.payload.service_date} />
                  <SummaryRow
                    label="Pax"
                    value={`${pending.payload.adults} adulto${pending.payload.adults !== 1 ? 's' : ''}${pending.payload.children ? ` · ${pending.payload.children} menor(es)` : ''}`}
                  />
                  <SummaryRow
                    label="Pago"
                    value={pending.payload.payment_method === 'cash' ? 'Efectivo (lo cobra el vendedor)' : 'Mercado Pago (link al pasajero)'}
                  />
                  <SummaryRow label="Total" value={`USD ${pending.totals.totalUsd}`} strong />
                </dl>

                {confirmError && (
                  <div className="mt-4 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
                    {confirmError}
                  </div>
                )}

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    disabled={confirmSubmitting}
                    onClick={() => setPending(null)}
                    className="flex-1 rounded-lg border border-gold/20 px-4 py-2.5 text-sm text-cream/70 hover:border-gold/40 transition-colors disabled:opacity-50"
                  >
                    ← Volver y corregir
                  </button>
                  <button
                    type="button"
                    disabled={confirmSubmitting}
                    onClick={handleConfirm}
                    className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirmSubmitting ? <><Spinner size="sm" className="mr-2" />Creando...</> : 'Confirmar y crear reserva'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-cream/50">{label}</dt>
      <dd className={`text-right ${strong ? 'font-display text-lg text-gold' : 'text-cream/90'}`}>{value}</dd>
    </div>
  );
}
