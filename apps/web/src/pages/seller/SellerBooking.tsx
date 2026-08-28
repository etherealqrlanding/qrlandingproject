import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { sellerApi } from '../../lib/sellerApi';
import type { ProductDetail, ProductOption, ProductSummary } from '../../types/api';
import SellerBookingModal from '../../components/seller/SellerBookingModal';
import { OptionInfoCard } from '../../components/seller/OptionInfoCard';
import SellerQuickSettings from '../../components/seller/SellerQuickSettings';
import AvailabilityCheckModal from '../../components/AvailabilityCheckModal';
import { useSellerAuth } from '../../hooks/useSellerAuth';

export default function SellerBooking() {
  const { me } = useSellerAuth();
  const isPermanent = me?.is_permanent ?? false;
  const cardEnabled = me?.card_enabled ?? true;
  const pinRequired = me?.team_pin_required ?? true;
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [booking, setBooking] = useState<{ product: ProductDetail; option: ProductOption; initialDate?: string; initialAdults?: number; initialChildren?: number } | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState<{ slug: string; name: string } | null>(null);
  // Comisión EFECTIVA por tier/servicio para tu perfil -- endpoint separado y
  // autenticado, nunca embebido en el catálogo público (api.products.*), que
  // cualquiera puede ver.
  const [commissionByOption, setCommissionByOption] = useState<Record<number, number>>({});

  useEffect(() => {
    api.products.list()
      .then(setProducts)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
    sellerApi.optionsCommission().then(setCommissionByOption).catch(() => {});
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

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <header className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Portal de Recomendadores</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Nueva Reserva</h1>
          <p className="mt-0.5 text-xs md:text-sm text-cream/50">Ingresá una reserva en nombre de un pasajero</p>
        </div>
        <SellerQuickSettings />
      </header>

      <div className="mb-4 md:mb-6 rounded-xl border border-gold/20 bg-gold/5 p-3 md:p-4 flex gap-3">
        <span className="text-gold text-lg mt-0.5" aria-hidden>✦</span>
        <div className="text-sm text-cream/70 leading-relaxed">
          <strong className="text-cream/90">Reservas manuales:</strong> elegí el show y la opción, completá los datos
          del pasajero y seleccioná la forma de pago.
          Usá <strong className="text-cream/80">Pago al recomendador</strong> si el pasajero paga en el momento (efectivo),
          o <strong className="text-cream/80">Mercado Pago</strong> para enviarle el link de pago online.
          La reserva quedará marcada como <em>ingresada manualmente por el recomendador</em>.
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-cream/40 text-sm py-10 text-center">No hay shows disponibles.</p>
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
            const isExpanded = expandedSlug === product.slug;
            return (
              <div
                key={product.id}
                className={`rounded-xl border overflow-hidden transition-colors ${
                  isExpanded ? 'border-gold/25 bg-ink-soft/60' : 'border-gold/10 bg-ink-soft/40'
                }`}
              >
                {/* Header del producto */}
                <div className="w-full flex items-center gap-2 px-5 py-4 hover:bg-gold/5 transition">
                  <button
                    type="button"
                    onClick={() => handleToggle(product.slug)}
                    className="flex-1 min-w-0 flex items-center gap-4 text-left"
                  >
                    {product.hero_image && (
                      <img
                        src={product.hero_image}
                        alt=""
                        className="h-14 w-14 rounded-lg object-cover shrink-0 border border-gold/10"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-cream font-semibold">{product.name}</p>
                      <p className="text-xs text-gold-soft">{product.venue_name}</p>
                      {product.short_description_es && (
                        <p className="text-xs text-cream/50 mt-0.5 line-clamp-1">{product.short_description_es}</p>
                      )}
                    </div>
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      {product.starting_price_usd != null && (
                        <span className="text-gold text-sm font-display">desde USD {product.starting_price_usd}</span>
                      )}
                      <span className={`text-cream/40 text-sm transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                    </div>
                    <span className={`sm:hidden text-cream/40 text-sm transition-transform inline-block shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCheckingAvailability({ slug: product.slug, name: product.name }); }}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gold/25 bg-gold/5 px-3 py-1.5 text-xs text-gold-soft hover:bg-gold/15 transition whitespace-nowrap"
                  >
                    <span aria-hidden>🗓</span>
                    <span className="hidden sm:inline">Verificar disponibilidad</span>
                  </button>
                </div>

                {/* Opciones expandidas */}
                {isExpanded && (
                  <div className="border-t border-gold/10 px-5 py-4 space-y-4">
                    {/* Info rápida del lugar */}
                    {expandedDetail && (expandedDetail.address_es || expandedDetail.schedule_summary_es) && (
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-cream/55 border-b border-gold/10 pb-3">
                        {expandedDetail.address_es && (
                          <span>📍 {expandedDetail.address_es}</span>
                        )}
                        {expandedDetail.schedule_summary_es && (
                          <span>🗓 {expandedDetail.schedule_summary_es}</span>
                        )}
                      </div>
                    )}

                    {loadingDetail ? (
                      <div className="space-y-2">
                        {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-ink-soft/60 animate-pulse" />)}
                      </div>
                    ) : expandedDetail ? (
                      expandedDetail.options.length === 0 ? (
                        <p className="text-sm text-cream/40">Sin opciones disponibles.</p>
                      ) : (
                        <div className="space-y-3">
                          {expandedDetail.options.map((opt) => (
                            <OptionInfoCard
                              key={opt.id}
                              option={opt}
                              productAvailableDays={expandedDetail.available_days}
                              productAcceptsChildren={expandedDetail.accepts_children}
                              productChildrenAgeLabel={expandedDetail.children_age_label}
                              commissionPercent={commissionByOption[opt.id]}
                              onBook={() => setBooking({ product: expandedDetail, option: opt })}
                            />
                          ))}
                        </div>
                      )
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {booking && (
        <SellerBookingModal
          product={booking.product}
          option={booking.option}
          initialDate={booking.initialDate}
          initialAdults={booking.initialAdults}
          initialChildren={booking.initialChildren}
          isPermanent={isPermanent}
          cardEnabled={cardEnabled}
          pinRequired={pinRequired}
          onClose={() => setBooking(null)}
        />
      )}

      {checkingAvailability && (
        <AvailabilityCheckModal
          productSlug={checkingAvailability.slug}
          productName={checkingAvailability.name}
          onClose={() => setCheckingAvailability(null)}
          onBookDate={(product, option, date, pax) => {
            setCheckingAvailability(null);
            setBooking({ product, option, initialDate: date, initialAdults: pax?.adults, initialChildren: pax?.children });
          }}
        />
      )}
    </div>
  );
}
