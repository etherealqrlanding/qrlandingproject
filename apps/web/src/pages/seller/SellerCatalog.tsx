import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { ProductDetail, ProductOption, ProductSummary } from '../../types/api';
import { OptionInfoCard } from '../../components/seller/OptionInfoCard';
import SellerBookingModal from '../../components/seller/SellerBookingModal';
import SellerQuickSettings from '../../components/seller/SellerQuickSettings';
import AvailabilityCheckModal from '../../components/seller/AvailabilityCheckModal';
import ShareButton from '../../components/ShareButton';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { buildShareUrl } from '../../lib/shareLinks';

export default function SellerCatalog() {
  const { me } = useSellerAuth();
  const isPermanent = me?.is_permanent ?? false;
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ProductDetail | 'loading' | 'error'>>({});
  const [booking, setBooking] = useState<{ product: ProductDetail; option: ProductOption; initialDate?: string; initialAdults?: number; initialChildren?: number } | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    api.products.list()
      .then(setProducts)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (slug: string) => {
    if (expanded === slug) {
      setExpanded(null);
      return;
    }
    setExpanded(slug);
    if (details[slug]) return;
    setDetails((prev) => ({ ...prev, [slug]: 'loading' }));
    try {
      const detail = await api.products.bySlug(slug);
      setDetails((prev) => ({ ...prev, [slug]: detail }));
    } catch {
      setDetails((prev) => ({ ...prev, [slug]: 'error' }));
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <header className="mb-2 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Portal de Vendedores</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Catálogo de Shows</h1>
          <p className="mt-0.5 text-xs md:text-sm text-cream/50">
            Info completa de cada servicio para asesorar a tus pasajeros
          </p>
        </div>
        <SellerQuickSettings />
      </header>

      <div className="mt-3 mb-5 md:mb-7 rounded-xl border border-gold/15 bg-gold/5 px-3 md:px-4 py-3 text-xs md:text-sm text-cream/70 flex gap-3">
        <span className="text-gold mt-0.5" aria-hidden>✦</span>
        <span>
          Hacé click en un show para ver todos los detalles: horarios, qué incluye, precios y días disponibles.
          Usá esta sección para responder preguntas de tus pasajeros rápidamente.
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-6">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-cream/40 text-sm py-10 text-center">No hay shows disponibles.</p>
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
            const isOpen = expanded === product.slug;
            const detail = details[product.slug];

            return (
              <div
                key={product.id}
                className={`rounded-xl border overflow-hidden transition-colors ${
                  isOpen ? 'border-gold/25 bg-ink-soft/60' : 'border-gold/10 bg-ink-soft/40'
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
                      <p className="text-cream font-semibold truncate">{product.name}</p>
                      <p className="text-xs text-gold-soft truncate">{product.venue_name}</p>
                      {product.short_description_es && (
                        <p className="text-xs text-cream/50 mt-0.5 line-clamp-1">{product.short_description_es}</p>
                      )}
                    </div>
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      {product.starting_price_usd != null && (
                        <span className="text-gold text-sm font-display">desde USD {product.starting_price_usd}</span>
                      )}
                      <span className={`text-cream/40 text-sm transition-transform inline-block ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </div>
                    <span className={`sm:hidden text-cream/40 text-sm transition-transform inline-block shrink-0 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCheckingAvailability({ slug: product.slug, name: product.name }); }}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gold/25 bg-gold/5 px-3 py-1.5 text-xs text-gold-soft hover:bg-gold/15 transition whitespace-nowrap"
                  >
                    <span aria-hidden>🗓</span>
                    <span className="hidden sm:inline">Verificar disponibilidad</span>
                  </button>
                  {me?.code && (
                    <ShareButton
                      className="shrink-0"
                      url={buildShareUrl(`/shows/${product.slug}`, me.code)}
                      title={product.name}
                      waMessage={`Hola! Te paso el link para reservar la experiencia: ${buildShareUrl(`/shows/${product.slug}`, me.code)}`}
                      label="Compartir"
                    />
                  )}
                </div>

                {/* Detalle expandido */}
                {isOpen && (
                  <div className="border-t border-gold/10 px-5 py-5 space-y-5">
                    {detail === 'loading' && (
                      <div className="space-y-3">
                        {[1, 2].map((i) => (
                          <div key={i} className="h-32 rounded-xl bg-ink-soft/60 animate-pulse" />
                        ))}
                      </div>
                    )}

                    {detail === 'error' && (
                      <p className="text-sm text-bordeaux-light">No se pudo cargar el detalle. Intentá de nuevo.</p>
                    )}

                    {detail && detail !== 'loading' && detail !== 'error' && (
                      <>
                        {/* Info del lugar */}
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          {detail.long_description_es && (
                            <div className="sm:col-span-2">
                              <p className="text-[10px] uppercase tracking-wider text-cream/35 mb-1">Descripción</p>
                              <p className="text-cream/70 leading-relaxed text-sm">{detail.long_description_es}</p>
                            </div>
                          )}
                          {detail.address_es && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-cream/35 mb-1">📍 Dirección</p>
                              <p className="text-cream/80 text-sm">{detail.address_es}</p>
                            </div>
                          )}
                          {detail.schedule_summary_es && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-cream/35 mb-1">🗓 Horario general</p>
                              <p className="text-cream/80 text-sm">{detail.schedule_summary_es}</p>
                            </div>
                          )}
                        </div>

                        {/* Imágenes extras */}
                        {detail.images.filter((img) => !img.is_hero).length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {detail.images.filter((img) => !img.is_hero).map((img) => (
                              <img
                                key={img.id}
                                src={img.url}
                                alt={img.alt_text ?? ''}
                                className="h-24 w-36 rounded-lg object-cover shrink-0 border border-gold/10"
                              />
                            ))}
                          </div>
                        )}

                        {/* Opciones */}
                        <div>
                          <p className="text-xs uppercase tracking-widest text-gold-soft mb-3">
                            Opciones disponibles ({detail.options.length})
                          </p>
                          {detail.options.length === 0 ? (
                            <p className="text-sm text-cream/40">Sin opciones cargadas.</p>
                          ) : (
                            <div className="space-y-3">
                              {detail.options.map((opt) => (
                                <OptionInfoCard
                                  key={opt.id}
                                  option={opt}
                                  productAvailableDays={detail.available_days}
                                  productAcceptsChildren={detail.accepts_children}
                                  productChildrenAgeLabel={detail.children_age_label}
                                  onBook={() => setBooking({ product: detail, option: opt })}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && products.length > 0 && (
        <p className="mt-4 text-xs text-cream/25 text-right">{products.length} show{products.length !== 1 ? 's' : ''} disponibles</p>
      )}

      {booking && (
        <SellerBookingModal
          product={booking.product}
          option={booking.option}
          initialDate={booking.initialDate}
          initialAdults={booking.initialAdults}
          initialChildren={booking.initialChildren}
          isPermanent={isPermanent}
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
