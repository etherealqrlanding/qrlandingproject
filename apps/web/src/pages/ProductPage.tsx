import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type SellerPublicInfo, type AvailabilityDay } from '../lib/api';
import type { ProductDetail, ProductOption } from '../types/api';
import MenuBlock from '../components/MenuBlock';
import { localized, localizedArray } from '../lib/i18nFields';
import { getStoredRef, clearRef } from '../lib/referral';
import { buildShareUrl } from '../lib/shareLinks';
import { ApiError } from '../lib/api';
import Carousel from '../components/Carousel';
import CheckoutForm from '../components/CheckoutForm';
import AvailabilityCheckModal from '../components/AvailabilityCheckModal';
import ShareButton from '../components/ShareButton';
import Collapse from '../components/Collapse';
import { useExchangeRate } from '../lib/useExchangeRate';

// Convierte un link normal de YouTube (watch?v=, youtu.be/, shorts/) a su URL de embed.
// Devuelve null si no se pudo reconocer el formato (el video simplemente no se muestra).
function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname.includes('youtu.be')) {
      id = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
      else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2];
    }
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

const PixIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
    <path d="M10 2L18 10L10 18L2 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="10" cy="10" r="2" fill="currentColor" />
  </svg>
);

const CreditCardIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0" aria-hidden>
    <rect x="2" y="5" width="16" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2 8.5H18" stroke="currentColor" strokeWidth="1.3" />
    <path d="M4.5 13H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const requestedOptionId = searchParams.get('option');
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const exchangeRate = useExchangeRate();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'mercadopago' | 'cash' | 'pix'>('mercadopago');
  const [checkoutPrefill, setCheckoutPrefill] = useState<{ date?: string; adults?: number; children?: number }>({});
  const [checkingAvailabilityOptionId, setCheckingAvailabilityOptionId] = useState<number | null>(null);
  const [sellerInfo, setSellerInfo] = useState<SellerPublicInfo | null>(null);
  // Si la cuenta no tiene tarjeta habilitada (sellers.card_enabled = false), el único
  // medio que le queda es pago manual -- evita abrir el checkout con Mercado Pago
  // preseleccionado cuando esa opción ni se va a mostrar.
  const defaultPaymentMethod: 'mercadopago' | 'cash' = sellerInfo?.card_enabled === false ? 'cash' : 'mercadopago';
  const showCardMethods = sellerInfo?.card_enabled !== false;
  const showCashMethod = sellerInfo?.is_permanent === true;

  useEffect(() => {
    const ref = getStoredRef();
    if (!ref) return;
    api.checkout.sellerInfo(ref)
      .then(setSellerInfo)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 410) clearRef();
        setSellerInfo(null);
      });
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setProduct(null);
    setError(null);
    api.products.bySlug(slug)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        const requested = requestedOptionId
          ? p.options.find((o) => String(o.id) === requestedOptionId)
          : null;
        setSelectedOptionId((requested ?? p.options[0])?.id ?? null);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [slug, requestedOptionId]);

  // Vino del selector rápido de la home: una vez que el producto está renderizado
  // (recién ahí existe #product-options en el DOM) hacemos scroll al servicio elegido.
  useEffect(() => {
    if (!product || !requestedOptionId) return;
    const hasRequested = product.options.some((o) => String(o.id) === requestedOptionId);
    if (!hasRequested) return;
    // Doble rAF: esperamos a que el navegador termine de pintar el layout real
    // (imágenes, secciones) antes de calcular la posición del scroll.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById(`product-option-${requestedOptionId}`)
          ?? document.getElementById('product-options');
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }, [product, requestedOptionId]);


  if (error) {
    return (
      <div className="container-narrow py-20">
        <p className="text-cream/70">{t('product.error')}: {error}</p>
        <Link to="/shows" className="mt-4 inline-block text-gold hover:underline">
          ← {t('product.back_to_list')}
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container-narrow py-20">
        <div className="aspect-[16/10] rounded-lg bg-ink-soft animate-pulse" />
        <div className="mt-8 h-12 w-2/3 rounded bg-ink-soft animate-pulse" />
      </div>
    );
  }

  const longDescription = localized(product, 'long_description', lang);
  const address = localized(product, 'address', lang);
  const videoEmbedUrl = product.video_url ? youtubeEmbedUrl(product.video_url) : null;
  const selectedOption = product.options.find((o) => o.id === selectedOptionId) ?? null;

  return (
    <article className="container-narrow pt-6 pb-16 sm:pt-12 md:pb-12">
      <Link to="/shows" className="text-sm text-gold-soft hover:text-gold">
        ← {t('product.back_to_list')}
      </Link>

      <header className="mt-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">{product.venue_name}</p>
          <h1 className="mt-2 font-display text-5xl md:text-6xl text-cream leading-[1.05]">
            {product.name}
          </h1>
        </div>
        <ShareButton
          className="mt-1"
          url={buildShareUrl(`/shows/${product.slug}`, getStoredRef())}
          title={product.name}
          waMessage={t('share.house_message', { link: buildShareUrl(`/shows/${product.slug}`, getStoredRef()) })}
          label={`↗ ${t('share.button')}`}
        />
      </header>

      <div className="mt-8 grid lg:grid-cols-[1fr_360px] gap-10">
        <div>
          <div className="mb-10">
            <Carousel
              images={product.images}
              videoEmbedUrl={videoEmbedUrl}
              videoTitle={`Video de ${product.venue_name}`}
            />
          </div>

          {longDescription && (
            <section>
              <h2 className="font-display text-3xl text-cream">{t('product.about')}</h2>
              <p className="mt-4 text-cream/80 leading-relaxed whitespace-pre-line">
                {longDescription}
              </p>
            </section>
          )}

          <section id="product-options" className="mt-12 scroll-mt-24">
            <h2 className="font-display text-3xl text-cream">{t('product.options_title')}</h2>
            <p className="mt-2 text-cream/60 text-sm">{t('product.options_subtitle')}</p>

            <HowToBookCard showCard={showCardMethods} showCash={showCashMethod} />

            <div className="mt-6 grid gap-4">
              {product.options.map((opt, i) => (
                <OptionCard
                  key={opt.id}
                  option={opt}
                  productAvailableDays={product.available_days}
                  productAcceptsChildren={product.accepts_children}
                  productChildrenAgeLabel={product.children_age_label}
                  // Si la casa tiene logo, se usa el mismo en todos los tiers (marca
                  // unificada). Si no, las opciones no tienen fotos propias — se
                  // recorren las de la casa (mismo orden que el carrusel de arriba)
                  // para que cada card se vea distinta en vez de repetir siempre la misma.
                  imageUrl={product.logo_url ?? (product.images.length > 0
                    ? product.images[i % product.images.length].url
                    : product.hero_image)}
                  isLogo={Boolean(product.logo_url)}
                  selected={opt.id === selectedOptionId}
                  onSelect={() => setSelectedOptionId(opt.id)}
                  onBook={() => {
                    setSelectedOptionId(opt.id);
                    setCheckoutPaymentMethod(defaultPaymentMethod);
                    setCheckoutPrefill({});
                    setCheckoutOpen(true);
                  }}
                  onCheckAvailability={() => setCheckingAvailabilityOptionId(opt.id)}
                  lang={lang}
                />
              ))}
            </div>
          </section>

          {address && (
            <section className="mt-12">
              <h2 className="font-display text-2xl text-cream">{t('product.location')}</h2>
              <p className="mt-3 text-sm text-cream/70">📍 {address}</p>
              <div className="mt-4 rounded-lg overflow-hidden border border-gold/15">
                <iframe
                  title={`Mapa de ${product.venue_name}`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(`${product.venue_name}, ${address}, Buenos Aires, Argentina`)}&output=embed`}
                  width="100%"
                  height="280"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
          <BookingSummary
            product={product}
            option={selectedOption}
            sellerInfo={sellerInfo}
            onBook={(method) => {
              setCheckoutPaymentMethod(method);
              setCheckoutPrefill({});
              setCheckoutOpen(true);
            }}
          />
          <HouseQuickFacts product={product} lang={lang} />
        </aside>
      </div>

      {/* Barra de reserva fija — solo mobile/tablet (el aside ya es sticky desde lg).
          Sin ella, en mobile había que scrollear hasta el resumen para reservar. */}
      {selectedOption && !checkoutOpen && (
        <div
          className="md:hidden fixed inset-x-0 z-40 border-t border-gold/20 bg-ink/95 backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="min-w-0">
            <p className="text-xs text-cream/50 truncate">{localized(selectedOption, 'name', lang)}</p>
            <p className="font-display text-lg text-gold leading-tight">
              USD {selectedOption.price_adult_usd}
              {exchangeRate != null && (
                <span className="ml-1.5 text-xs font-sans text-cream/40">
                  · ARS {Math.round(selectedOption.price_adult_usd * exchangeRate).toLocaleString('es-AR')}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setCheckoutPaymentMethod(defaultPaymentMethod); setCheckoutPrefill({}); setCheckoutOpen(true); }}
            className="btn-primary shrink-0 px-5 py-2.5 text-sm"
          >
            {t('product.book_cta')}
          </button>
        </div>
      )}

      {checkoutOpen && selectedOption && (
        <CheckoutForm
          product={product}
          option={selectedOption}
          onClose={() => setCheckoutOpen(false)}
          initialPaymentMethod={checkoutPaymentMethod}
          showCash={sellerInfo?.is_permanent === true}
          showCard={sellerInfo?.card_enabled !== false}
          initialDate={checkoutPrefill.date}
          initialAdults={checkoutPrefill.adults}
          initialChildren={checkoutPrefill.children}
        />
      )}

      {checkingAvailabilityOptionId != null && (
        <AvailabilityCheckModal
          productSlug={product.slug}
          productName={product.name}
          initialOptionId={checkingAvailabilityOptionId}
          onClose={() => setCheckingAvailabilityOptionId(null)}
          onBookDate={(_bookedProduct, bookedOption, date, pax) => {
            setCheckingAvailabilityOptionId(null);
            setSelectedOptionId(bookedOption.id);
            setCheckoutPaymentMethod(defaultPaymentMethod);
            setCheckoutPrefill({ date, adults: pax?.adults, children: pax?.children });
            setCheckoutOpen(true);
          }}
        />
      )}
    </article>
  );
}

function OptionCard({
  option, productAvailableDays, productAcceptsChildren, productChildrenAgeLabel, imageUrl, isLogo, selected, onSelect, onBook, onCheckAvailability, lang,
}: {
  option: ProductOption;
  productAvailableDays: number[];
  productAcceptsChildren: boolean;
  productChildrenAgeLabel: string | null;
  imageUrl: string | null;
  // El logo es el mismo para todos los tiers de la casa — a diferencia de una foto,
  // no se recorta (object-contain) porque suele venir con transparencia.
  isLogo?: boolean;
  selected: boolean;
  onSelect: () => void;
  onBook: () => void;
  onCheckAvailability: () => void;
  lang: string | undefined;
}) {
  const { t } = useTranslation();
  const exchangeRate = useExchangeRate();
  const name = localized(option, 'name', lang);
  const description = localized(option, 'description', lang);
  const includes = localizedArray(option, 'includes', lang);
  const pickup = localized(option, 'pickup_window', lang);
  const dinner = localized(option, 'dinner_time', lang);
  const show = localized(option, 'show_time', lang);
  const showChildPrice = productAcceptsChildren && option.price_child_usd != null;
  const priceArs = exchangeRate != null ? Math.round(option.price_adult_usd * exchangeRate) : null;
  const priceChildArs = (exchangeRate != null && showChildPrice)
    ? Math.round(option.price_child_usd! * exchangeRate) : null;
  const hasTimes = Boolean(pickup || dinner || show);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      id={`product-option-${option.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={`text-left rounded-lg border p-5 transition cursor-pointer select-none ${
        selected
          ? 'border-gold/70 bg-gold/5 ring-1 ring-gold/40'
          : 'border-gold/10 bg-ink-soft hover:border-gold/30'
      }`}
    >
      {/* flex-wrap: en mobile el box de precio no entra al lado de imagen+título
          y pasa solo (por el w-full) a su propia fila completa, en vez de quedar
          apretado y desalineado debajo del título como antes. En desktop
          (sm:w-auto) vuelve a compartir fila, empujado a la derecha por el
          flex-1 del bloque de título. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        {imageUrl && (
          isLogo ? (
            <div className="h-20 w-28 sm:h-24 sm:w-32 shrink-0 rounded-md border border-gold/10 bg-ink/40 flex items-center justify-center p-2">
              <img src={imageUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="h-20 w-28 sm:h-24 sm:w-32 shrink-0 rounded-md object-cover border border-gold/10"
            />
          )
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl text-cream">{name}</h3>
          {description && <p className="mt-1 text-sm text-cream/70">{description}</p>}
          {(option.has_dinner || option.transfer_mode !== 'none') && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {option.has_dinner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-amber-700/40 bg-amber-900/20 text-amber-300">
                  🍽 {t('product.dinner_included')}
                </span>
              )}
              {option.transfer_mode === 'included' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-sky-700/40 bg-sky-900/20 text-sky-300">
                  🚐 {t('product.transfer_included')}
                </span>
              )}
              {option.transfer_mode === 'optional' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-sky-700/40 bg-sky-900/10 text-sky-300/80">
                  🚐 {t('product.transfer_optional')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="w-full sm:w-auto self-start shrink-0 rounded-lg border border-gold/15 bg-gold/5 px-4 py-3 flex items-center justify-between gap-3 sm:block sm:text-right">
          <div>
            <p className="text-xl font-display text-gold leading-tight">USD {option.price_adult_usd}</p>
            {priceArs != null && (
              <p className="text-sm font-display text-gold/80">ARS {priceArs.toLocaleString('es-AR')}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-cream/50">{t('product.per_adult')}</p>
            {showChildPrice && (
              <p className="mt-1.5 pt-1.5 border-t border-gold/10 text-xs text-cream/60">
                {t('product.children')}{productChildrenAgeLabel ? ` (${productChildrenAgeLabel})` : ''}: <span className="text-cream/85">USD {option.price_child_usd}</span>
                {priceChildArs != null && (
                  <span className="text-cream/40"> · ARS {priceChildArs.toLocaleString('es-AR')}</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {hasTimes && (
        <div className="mt-4 rounded-lg border border-gold/10 bg-ink/30 px-3 py-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-cream/60">
          {pickup && <span>🚐 {pickup}</span>}
          {dinner && <span>🍽 {dinner}</span>}
          {show && <span>🎭 {show}</span>}
        </div>
      )}

      {option.available_days.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-cream/35 uppercase tracking-wider mr-1">{t('product.days_available')}</span>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <span
              key={d}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                option.available_days.includes(d) && productAvailableDays.includes(d)
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : 'bg-ink/40 text-cream/15 border border-cream/10'
              }`}
            >
              {t(`product.day_${d}`)}
            </span>
          ))}
        </div>
      )}

      {includes.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider text-cream/35 mb-1.5">{t('product.includes_title')}</p>
          <ul className="space-y-1">
            {includes.map((it, i) => (
              <li key={i} className="text-sm text-cream/75 flex gap-2">
                <span className="text-gold mt-0.5">✓</span>
                {/* Viene sanitizado del backend (solo negrita/cursiva/subrayado, sin
                    atributos) — ver api/src/lib/sanitizeHtml.ts. */}
                <span dangerouslySetInnerHTML={{ __html: it }} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {option.menu && option.menu.content_html && (
        // Siempre arranca cerrado: el contenido de un menú puede ser largo
        // (varios cursos y platos) y no queremos alargar la card por defecto.
        <div className="mt-4">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="cursor-pointer flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gold-soft hover:text-gold"
          >
            <span className={`transition-transform ${menuOpen ? 'rotate-90' : ''}`}>▸</span>
            {t('product.menu_view')}
          </button>
          {menuOpen && (
            <Collapse className="mt-2">
              <MenuBlock menu={option.menu} />
            </Collapse>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCheckAvailability(); }}
          className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 rounded-md border border-gold/25 bg-gold/5 px-4 py-2.5 text-sm text-gold-soft hover:bg-gold/15 transition"
        >
          <span aria-hidden>🗓</span> {t('product.check_availability')}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onBook(); }}
          className="w-full btn-primary text-sm py-2.5"
        >
          {t('product.book_option')}
        </button>
      </div>
    </div>
  );
}

// Card de incentivo al lado del título de opciones — 3 pasos simples para bajar
// la fricción de reservar justo donde el cliente está por elegir una opción.
function HowToBookCard({ showCard, showCash }: { showCard: boolean; showCash: boolean }) {
  const { t } = useTranslation();
  // El paso 3 depende de qué medios tiene habilitados esta cuenta puntual
  // (sellers.card_enabled / is_permanent) -- nunca hay que nombrar un medio que
  // después no aparece como opción real en el selector de pago.
  const step3Key = showCard && showCash
    ? 'product.how_to_book_step3_card_cash'
    : showCard
      ? 'product.how_to_book_step3_card_only'
      : 'product.how_to_book_step3_cash_only';
  return (
    <div className="mt-5 rounded-lg border border-gold/20 bg-gold/5 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-0 sm:divide-x sm:divide-gold/15">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-start gap-2.5 sm:flex-1 sm:px-4 sm:first:pl-0 sm:last:pr-0">
            <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-gold/20 text-gold text-[11px] font-medium flex items-center justify-center">
              {step}
            </span>
            <span className="text-sm text-cream/75 leading-snug">
              {t(step === 3 ? step3Key : `product.how_to_book_step${step}`)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-cream/40">⚡ {t('product.how_to_book_note')}</p>
    </div>
  );
}

// Card compacta de info de la casa, debajo del resumen de reserva — para que el
// cliente vea de un vistazo días/horarios, ubicación y servicios incluidos sin
// tener que bajar hasta las secciones completas (que siguen existiendo más abajo).
function HouseQuickFacts({ product, lang }: { product: ProductDetail; lang: string | undefined }) {
  const { t } = useTranslation();
  const schedule = localized(product, 'schedule_summary', lang);
  const neighborhood = localized(product, 'neighborhood', lang);
  const anyDinner = product.options.some((o) => o.has_dinner);
  // Esta sección es "Servicios incluidos" — un traslado opcional (con costo) no
  // cuenta acá, solo el que ya viene incluido en el precio sin cargo extra.
  const anyTransfer = product.options.some((o) => o.transfer_mode === 'included');
  const hasDays = product.available_days.length > 0;

  if (!hasDays && !schedule && !neighborhood && !anyDinner && !anyTransfer) return null;

  return (
    <div className="rounded-lg border border-gold/10 bg-ink-soft/40 p-5">
      <p className="text-xs uppercase tracking-widest text-gold-soft mb-4">{t('product.house_info_title')}</p>

      <div className="flex flex-col divide-y divide-gold/10">
        {(hasDays || schedule) && (
          <div className="pb-4">
            <p className="text-xs text-cream/40 mb-1.5">🗓 {t('product.schedule')}</p>
            {hasDays && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <span
                    key={d}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                      product.available_days.includes(d)
                        ? 'bg-gold/20 text-gold border border-gold/30'
                        : 'bg-ink/40 text-cream/15 border border-cream/10'
                    }`}
                  >
                    {t(`product.day_${d}`)}
                  </span>
                ))}
              </div>
            )}
            {schedule && <p className="text-sm text-cream/70">{schedule}</p>}
          </div>
        )}

        {neighborhood && (
          <div className="py-4">
            <p className="text-xs text-cream/40 mb-1.5">📍 {t('product.location')}</p>
            <p className="text-sm text-cream/70">{neighborhood}</p>
          </div>
        )}

        {(anyDinner || anyTransfer) && (
          <div className="pt-4">
            <p className="text-xs text-cream/40 mb-1.5">{t('product.services_included')}</p>
            <div className="flex flex-wrap gap-1.5">
              {anyDinner && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-amber-700/40 bg-amber-900/20 text-amber-300">
                  🍽 {t('product.dinner_included')}
                </span>
              )}
              {anyTransfer && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-sky-700/40 bg-sky-900/20 text-sky-300">
                  🚐 {t('product.transfer_included')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingSummary({
  product, option, sellerInfo, onBook,
}: {
  product: ProductDetail;
  option: ProductOption | null;
  sellerInfo: SellerPublicInfo | null;
  onBook: (method: 'mercadopago' | 'cash' | 'pix') => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const exchangeRate = useExchangeRate();
  // Disponibilidad de los próximos días — para mostrar la urgencia real (si la hay)
  // acá mismo, antes de que el cliente abra el checkout y tenga que elegir una
  // fecha para recién ahí enterarse de que quedan pocos lugares.
  const [urgentDay, setUrgentDay] = useState<AvailabilityDay | null>(null);

  useEffect(() => {
    if (!option) { setUrgentDay(null); return; }
    let cancelled = false;
    const today = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);
    api.availability.forOption(
      option.id,
      today.toISOString().slice(0, 10),
      horizon.toISOString().slice(0, 10),
    )
      .then((days) => {
        if (cancelled) return;
        setUrgentDay(days.find((d) => d.status === 'low') ?? null);
      })
      .catch(() => { if (!cancelled) setUrgentDay(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option?.id]);

  if (!option) return null;

  const showCash = sellerInfo?.is_permanent === true;
  const showCard = sellerInfo?.card_enabled !== false;
  const showChildPrice = product.accepts_children && option.price_child_usd != null;
  const priceArs = exchangeRate != null ? Math.round(option.price_adult_usd * exchangeRate) : null;
  const priceChildArs = (exchangeRate != null && showChildPrice)
    ? Math.round(option.price_child_usd! * exchangeRate) : null;
  const urgentDayLabel = urgentDay
    ? new Date(`${urgentDay.date}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    : null;

  return (
    <div className="rounded-lg border border-gold/20 bg-ink-soft/80 p-4">
      <p className="text-xs uppercase tracking-widest text-gold-soft">{t('product.your_selection')}</p>
      <h3 className="mt-1.5 font-display text-xl text-cream">
        {localized(option, 'name', lang)}
      </h3>
      <p className="text-sm text-cream/60">{product.venue_name}</p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-display text-gold">USD {option.price_adult_usd}</span>
        {priceArs != null && (
          <span className="text-xl font-display text-gold/90">ARS {priceArs.toLocaleString('es-AR')}</span>
        )}
        <span className="text-sm text-cream/50">/ {t('product.per_adult_short')}</span>
      </div>

      {urgentDayLabel && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold-soft">
          ⚡ Pocos lugares el {urgentDayLabel}
          {urgentDay?.remaining != null ? ` (quedan ${urgentDay.remaining})` : ''}
        </p>
      )}

      {showChildPrice && (
        <p className="mt-2 text-sm text-cream/60">
          {t('product.children')}{product.children_age_label ? ` (${product.children_age_label})` : ''}:{' '}
          <span className="text-cream/85">USD {option.price_child_usd}</span>
          {priceChildArs != null && (
            <>
              <span className="text-cream/30 mx-1">·</span>
              <span className="text-cream/85">ARS {priceChildArs.toLocaleString('es-AR')}</span>
            </>
          )}
        </p>
      )}

      <div className="mt-3 rounded-lg bg-gold/5 border border-gold/15 px-2.5 py-2 flex gap-2 items-start">
        <span className="text-gold-soft text-sm shrink-0 leading-none mt-0.5">💱</span>
        <p className="text-[11px] text-cream/60 leading-snug">{t(showCard ? 'product.currency_notice_card' : 'product.currency_notice_cash_only')}</p>
      </div>

      <div className="mt-3 space-y-1.5">
        {showCard && (
          <button
            type="button"
            onClick={() => onBook('mercadopago')}
            className="btn-primary w-full gap-2 py-2.5"
          >
            {CreditCardIcon}
            {showCash ? t('checkout.pay_with_mp') : t('product.book_cta')}
          </button>
        )}
        {showCard && (
          <button
            type="button"
            onClick={() => onBook('pix')}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#32BCAD]/40 bg-[#32BCAD]/10 px-6 py-2.5 text-sm font-medium text-[#5fd9cb] hover:bg-[#32BCAD]/20 transition"
          >
            {PixIcon}
            {t('checkout.pay_with_pix')}
          </button>
        )}
        {showCash && (
          <button
            type="button"
            onClick={() => onBook('cash')}
            className={showCard ? 'btn-ghost w-full py-2.5' : 'btn-primary w-full py-2.5'}
          >
            {t('checkout.pay_with_seller')}
          </button>
        )}
        <p className="mt-1 text-xs text-cream/40 text-center">{t(showCard ? 'product.secure_payment_card' : 'product.secure_payment_cash_only')}</p>
      </div>
    </div>
  );
}
