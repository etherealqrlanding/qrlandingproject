import { useEffect, useMemo, useRef, useState } from 'react';
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
import ShareButton from '../components/ShareButton';
import Collapse from '../components/Collapse';
import TransferHotelsInfo from '../components/TransferHotelsInfo';
import { useExchangeRate } from '../lib/useExchangeRate';
import NumberStepper from '../components/NumberStepper';
import { computeBookingTotals, round2, transferPriceRange } from '../lib/pricing';
import { buildHouseScheduleSummary } from '../lib/schedule';
import AvailabilityCalendar from '../components/AvailabilityCalendar';

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

// Espejo de la selección (adultos/menores/traslado/fecha) de la card de opción
// actualmente elegida — compartido entre OptionCard, BookingSummary y los puntos
// que abren el checkout, para que todos queden sincronizados entre sí.
interface SelectionPreview {
  adults: number;
  children: number;
  transferQty: number;
  infants: number;
  date?: string;
  // true si la cantidad de pasajeros elegida ya no entra en el cupo de la fecha
  // (la propia OptionCard se auto-corrige apenas puede, pero mientras la corrección
  // está en vuelo — o en el caso límite de cupo 0 — hay que bloquear reservar).
  capacityBlocked: boolean;
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
  const [checkoutPrefill, setCheckoutPrefill] = useState<{ date?: string; adults?: number; children?: number; infants?: number; transferWanted?: boolean }>({});
  // Espejo en vivo de lo que el usuario va marcando en la card de la opción
  // seleccionada (adultos/menores/traslado/fecha) — lo consume "Tu elección" para
  // mostrar el mismo preview sincronizado, y los 3 puntos que abren el checkout
  // (acá, la barra fija mobile) para precargarlo con exactamente lo mismo que se ve.
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreview>({ adults: 1, children: 0, transferQty: 0, infants: 0, capacityBlocked: false });
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
                  productChildrenAgeLabel={product.children_age_label}
                  productInfantAgeLabel={product.infant_age_label}
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
                  onPreviewChange={setSelectionPreview}
                  onBook={(pax) => {
                    setSelectedOptionId(opt.id);
                    setCheckoutPaymentMethod(defaultPaymentMethod);
                    setCheckoutPrefill({ date: pax.date, adults: pax.adults, children: pax.children, infants: pax.infants, transferWanted: pax.transferQty > 0 });
                    setCheckoutOpen(true);
                  }}
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
            preview={selectionPreview}
            onBook={(method) => {
              setCheckoutPaymentMethod(method);
              setCheckoutPrefill({
                date: selectionPreview.date,
                adults: selectionPreview.adults,
                children: selectionPreview.children,
                infants: selectionPreview.infants,
                transferWanted: selectionPreview.transferQty > 0,
              });
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
            {(() => {
              const { totalUsd } = computeBookingTotals(
                selectedOption, selectionPreview.adults, selectionPreview.children, selectionPreview.transferQty,
                selectedOption.price_child_usd != null,
                selectionPreview.infants,
              );
              return (
                <p className="font-display text-lg text-gold leading-tight">
                  USD {totalUsd}
                  {exchangeRate != null && (
                    <span className="ml-1.5 text-xs font-sans text-cream/40">
                      · ARS {Math.round(totalUsd * exchangeRate).toLocaleString('es-AR')}
                    </span>
                  )}
                </p>
              );
            })()}
          </div>
          <button
            type="button"
            disabled={selectionPreview.capacityBlocked}
            onClick={() => {
              setCheckoutPaymentMethod(defaultPaymentMethod);
              setCheckoutPrefill({
                date: selectionPreview.date,
                adults: selectionPreview.adults,
                children: selectionPreview.children,
                infants: selectionPreview.infants,
                transferWanted: selectionPreview.transferQty > 0,
              });
              setCheckoutOpen(true);
            }}
            className="btn-primary shrink-0 px-5 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
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
          initialInfants={checkoutPrefill.infants}
          initialTransferWanted={checkoutPrefill.transferWanted}
        />
      )}
    </article>
  );
}

function formatShortDate(iso: string): string {
  const raw = new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function OptionCard({
  option, productAvailableDays, productChildrenAgeLabel, productInfantAgeLabel, imageUrl, isLogo, selected, onSelect, onPreviewChange, onBook, lang,
}: {
  option: ProductOption;
  productAvailableDays: number[];
  productChildrenAgeLabel: string | null;
  productInfantAgeLabel: string | null;
  imageUrl: string | null;
  // El logo es el mismo para todos los tiers de la casa — a diferencia de una foto,
  // no se recorta (object-contain) porque suele venir con transparencia.
  isLogo?: boolean;
  selected: boolean;
  onSelect: () => void;
  // Reporta la selección de ESTA card (adultos/menores/traslado/fecha) al padre —
  // pero solo mientras esté seleccionada, para que "Tu elección" y el checkout
  // reflejen siempre exactamente lo que se ve acá.
  onPreviewChange: (preview: SelectionPreview) => void;
  onBook: (pax: { adults: number; children: number; transferQty: number; infants: number; date?: string }) => void;
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
  const showChildPrice = option.price_child_usd != null;
  const hasTimes = Boolean(pickup || dinner || show);
  const [menuOpen, setMenuOpen] = useState(false);

  // Preview de gasto: el usuario ajusta acá mismo cantidad de adultos/menores/traslado
  // y ve el precio total recalcularse en vivo, sin tener que abrir el checkout.
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  // Solo aplica cuando transfer_mode === 'optional': el cliente decide con un
  // Sí/No si quiere sumar el traslado (con costo) o no, arranca en "No" para no
  // sorprender con un cargo que no pidió. 'included' no pregunta nada (va gratis
  // para todos); 'none' no tiene traslado.
  const [transferWanted, setTransferWanted] = useState(false);
  const totalPax = adults + children;
  // El traslado, cuando se suma, es siempre todo o nada: todos los pax de la
  // reserva (adultos + menores) — no puede haber menos ni más traslado que
  // pasajeros. Los infantes se cobran aparte en computeBookingTotals, pero también
  // ocupan lugar en el vehículo.
  const transferQty = option.transfer_mode === 'included' ? totalPax
    : option.transfer_mode === 'optional' ? (transferWanted ? totalPax : 0)
    : 0;
  const { totalUsd, transferUsd, infantTransferUsd } = useMemo(
    () => computeBookingTotals(option, adults, children, transferQty, showChildPrice, infants),
    [option, adults, children, transferQty, showChildPrice, infants],
  );
  const totalArs = exchangeRate != null ? Math.round(totalUsd * exchangeRate) : null;
  // Desglose para que el cliente vea exactamente qué compone el total (pasajeros +
  // traslado), en vez de un único número sin explicación.
  const adultsUsd = round2(option.price_adult_usd * adults);
  const childrenUsd = showChildPrice ? round2((option.price_child_usd ?? 0) * children) : 0;
  // Acá todavía no se eligió hotel (eso pasa recién en el checkout) — si la casa
  // distingue precio por zona, el total es solo un estimado con el precio base.
  const zoneRange = transferPriceRange(option);

  // Selector de fecha + disponibilidad en vivo, directo en la card (reemplaza al viejo
  // botón "Verificar disponibilidad" que abría un modal aparte): se abre un popover con
  // el mismo calendario del checkout, y al elegir un día habilitado (el propio calendario
  // ya deshabilita los sin cupo) se cierra solo y el trigger queda mostrando la fecha con
  // el semáforo de disponibilidad en verde/ámbar.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateOpen, setDateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const dateFieldRef = useRef<HTMLDivElement>(null);
  // Sin fecha elegida, validamos contra HOY por default (mismo criterio que el
  // checkout) — así el tope de adultos/menores nunca queda "suelto" en 20.
  const effectiveDate = selectedDate ?? today;

  useEffect(() => {
    if (!dateOpen) return;
    const handler = (e: MouseEvent) => {
      if (dateFieldRef.current && !dateFieldRef.current.contains(e.target as Node)) setDateOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dateOpen]);

  // Cupo REAL de esta opción para effectiveDate — se re-verifica cada vez que cambia
  // la fecha (elegida acá o el default de hoy), así nunca queda desactualizado. Si al
  // llegar la respuesta la cantidad ya cargada de pasajeros no entra, se recorta sola
  // (mismo criterio que CheckoutForm) en vez de dejar pasar un pedido imposible.
  const [dateCapacity, setDateCapacity] = useState<{ remaining: number; status: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDateCapacity(null);
    api.availability.remainingForDate(option.id, effectiveDate)
      .then((d) => {
        if (cancelled) return;
        setDateCapacity({ remaining: d.remaining, status: d.status });
        const total = adults + children;
        if (d.remaining < total) {
          const newAdults = Math.max(1, Math.min(adults, d.remaining));
          setAdults(newAdults);
          setChildren(Math.max(0, d.remaining - newAdults));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id, effectiveDate]);

  const remaining = dateCapacity?.remaining ?? null;
  const maxAdults = remaining != null ? Math.min(20, Math.max(1, remaining - children)) : 20;
  const maxChildren = remaining != null ? Math.min(20, Math.max(0, remaining - adults)) : 20;
  // Caso límite: cupo 0 pero el mínimo de 1 adulto no se puede bajar más — no hay
  // forma de que este pedido entre en esta fecha, hay que avisar y no dejar reservar.
  const dateOverCapacity = remaining != null && remaining < totalPax;
  const dateBlocked = dateOverCapacity || dateCapacity?.status === 'full' || dateCapacity?.status === 'closed';

  // Mientras esta card esté seleccionada, cualquier cambio acá (steppers o fecha) se
  // refleja en vivo en "Tu elección" y queda listo para precargar el checkout —
  // incluida la primera vez que se selecciona, para que arranque ya sincronizada.
  useEffect(() => {
    if (selected) onPreviewChange({ adults, children, transferQty, infants, date: selectedDate, capacityBlocked: dateBlocked });
  }, [selected, adults, children, transferQty, infants, selectedDate, dateBlocked, onPreviewChange]);

  // Al pasar a OTRO servicio se resetea esta card a sus valores por default — si no,
  // queda "colgada" con lo último que se marcó acá y confunde: el usuario podría
  // pensar que esos adultos/menores/fecha siguen aplicando a la opción que ve ahora.
  useEffect(() => {
    if (!selected) {
      setAdults(1);
      setChildren(0);
      setInfants(0);
      setTransferWanted(false);
      setSelectedDate(undefined);
    }
  }, [selected]);

  const stepperCount = 3 + (showChildPrice ? 1 : 0);
  // Siempre 2 por fila, incluso en mobile (adultos+menores en una fila, traslado+fecha
  // en la siguiente) — antes cada uno ocupaba su propia fila y el contenedor se hacía
  // demasiado alto en mobile. En pantallas más anchas se abre a 3/4 si hay lugar.
  const stepperGridClass = stepperCount === 5 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
    : stepperCount === 4 ? 'grid-cols-2 lg:grid-cols-4'
    : stepperCount === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2';

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
          <h3 className="font-display text-2xl text-cream">{name}</h3>
          {description && <p className="mt-1 text-xs text-cream/70">{description}</p>}
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
      </div>

      {/* Preview de gasto: ancho completo debajo del header (no al costado de la
          imagen) para que los steppers tengan lugar de sobra en mobile — cada uno
          en su propia fila angosta en vez de comprimirse en columnas rotas. */}
      <div
        className="mt-3 rounded-lg border border-gold/15 bg-gold/5 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`grid ${stepperGridClass} gap-2`}>
          <NumberStepper
            bare label={t('checkout.adults')} value={adults} min={1} max={maxAdults} onChange={setAdults}
            cappedMessage={t('checkout.capacity_max_reached')}
            decrementLabel="menos" incrementLabel="más"
          />
          {showChildPrice && (
            <NumberStepper
              bare
              label={`${t('product.children')}${productChildrenAgeLabel ? ` (${productChildrenAgeLabel})` : ''}`}
              value={children} min={0} max={maxChildren} onChange={setChildren}
              cappedMessage={t('checkout.capacity_max_reached')}
              decrementLabel="menos" incrementLabel="más"
            />
          )}
          <NumberStepper
            bare
            label={`${t('checkout.infants')}${productInfantAgeLabel ? ` (${productInfantAgeLabel})` : ''}`}
            value={infants} min={0} max={20} onChange={setInfants}
            decrementLabel="menos" incrementLabel="más"
          />
          <div className="relative" ref={dateFieldRef}>
            <span className="block text-xs text-cream/80 mb-1">{t('checkout.service_date')}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDateOpen((v) => !v); }}
              className={`w-full flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition ${
                dateBlocked
                  ? 'border-bordeaux-light/50 bg-bordeaux-deep/10 text-bordeaux-light'
                  : selectedDate && remaining != null
                    ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400'
                    : 'border-gold/25 bg-ink/40 text-cream hover:border-gold/50'
              }`}
            >
              <span aria-hidden>{dateBlocked ? '⚠' : '📅'}</span>
              <span className="flex-1 text-left truncate">
                {selectedDate ? formatShortDate(selectedDate) : t('product.pick_date')}
              </span>
              {!dateBlocked && selectedDate && remaining != null && <span aria-hidden>✓</span>}
            </button>
            {dateBlocked && (
              <p className="mt-1 text-[11px] text-bordeaux-light">
                {dateOverCapacity ? t('product.no_capacity_for_pax') : t('checkout.capacity_max_reached')}
              </p>
            )}

            {dateOpen && (
              <div
                className="absolute z-20 mt-1 w-72 max-w-[80vw] rounded-lg bg-ink-soft shadow-xl shadow-black/40"
                onClick={(e) => e.stopPropagation()}
              >
                <AvailabilityCalendar
                  optionId={option.id}
                  value={selectedDate ?? today}
                  currentDate={today}
                  onChange={(d) => { setSelectedDate(d); setDateOpen(false); }}
                  pax={totalPax}
                  compact
                />
              </div>
            )}
          </div>
        </div>

        {option.transfer_mode === 'optional' && (
          <p className="mt-2 text-[11px] text-cream/40 italic">{t('product.infant_transfer_note')}</p>
        )}

        {option.transfer_mode === 'optional' && (
          <div className="mt-2.5 pt-2.5 border-t border-gold/10 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-cream/80">
                🚐 {t('product.transfer_ask')} <span className="text-cream/40">(USD {option.transfer_price_usd}/pax)</span>
              </p>
              <p className={`mt-0.5 text-[11px] ${transferWanted ? 'text-emerald-400' : 'text-cream/40'}`}>
                {transferWanted ? `✓ ${t('product.transfer_added')}` : t('product.transfer_not_added')}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setTransferWanted(true); }}
                aria-pressed={transferWanted}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                  transferWanted
                    ? 'bg-gold text-ink'
                    : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'
                }`}
              >
                {t('product.transfer_yes')}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setTransferWanted(false); }}
                aria-pressed={!transferWanted}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                  !transferWanted
                    ? 'bg-gold text-ink'
                    : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'
                }`}
              >
                {t('product.transfer_no')}
              </button>
            </div>
          </div>
        )}

        {/* Desglose del total: para que quede claro qué compone el precio (pasajeros
            y traslado), no solo el número final. */}
        <div className="mt-2.5 pt-2 border-t border-gold/10 space-y-1">
          <div className="flex items-center justify-between text-xs text-cream/60">
            <span>{t('checkout.adults')} ({adults} × USD {option.price_adult_usd})</span>
            <span className="text-cream/80">USD {adultsUsd}</span>
          </div>
          {showChildPrice && children > 0 && (
            <div className="flex items-center justify-between text-xs text-cream/60">
              <span>{t('product.children')} ({children} × USD {option.price_child_usd})</span>
              <span className="text-cream/80">USD {childrenUsd}</span>
            </div>
          )}
          {transferUsd > 0 && (
            <div className="flex items-center justify-between text-xs text-cream/60">
              <span>
                {t('checkout.transfer')} ({transferQty + (infantTransferUsd > 0 ? infants : 0)} × USD {zoneRange.hasZonePricing ? `${t('product.transfer_from')} ${zoneRange.min}` : option.transfer_price_usd})
              </span>
              <span className="text-cream/80">+ USD {round2(transferUsd + infantTransferUsd)}</span>
            </div>
          )}
          {transferUsd > 0 && zoneRange.hasZonePricing && (
            <p className="text-[10px] text-cream/40 italic">{t('product.transfer_zone_note', { centro: option.transfer_price_usd, palermo: option.transfer_price_usd_palermo })}</p>
          )}
          {option.transfer_mode === 'included' && (
            <div className="flex items-center justify-between text-xs text-cream/60">
              <span>{t('checkout.transfer')} ({totalPax} pax)</span>
              <span className="text-emerald-400">{t('product.transfer_included_free')}</span>
            </div>
          )}
          {option.transfer_mode === 'included' && (
            <p className="text-[10px] text-cream/40 italic">{t('product.transfer_included_note')}</p>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-gold/10 flex items-end justify-between gap-3">
          <p className="text-[11px] text-cream/50">
            {transferUsd > 0 && zoneRange.hasZonePricing
              ? `${t('checkout.total')} (${t('product.transfer_from')})`
              : t('checkout.total')}
          </p>
          <div className="text-right shrink-0">
            <p className="text-3xl font-display text-gold leading-tight">USD {totalUsd}</p>
            {totalArs != null && (
              <p className="text-xs text-cream/40">ARS {totalArs.toLocaleString('es-AR')}</p>
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

      <div className="mt-4">
        <button
          type="button"
          disabled={dateBlocked}
          onClick={(e) => { e.stopPropagation(); onBook({ adults, children, transferQty, infants, date: selectedDate }); }}
          className="w-full btn-primary text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
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
  const schedule = buildHouseScheduleSummary(product);
  const neighborhood = localized(product, 'neighborhood', lang);
  const address = localized(product, 'address', lang);
  const anyDinner = product.options.some((o) => o.has_dinner);
  // Esta sección es "Servicios incluidos" — un traslado opcional (con costo) no
  // cuenta acá, solo el que ya viene incluido en el precio sin cargo extra.
  const anyTransfer = product.options.some((o) => o.transfer_mode === 'included');
  // El listado de hoteles, en cambio, es relevante apenas hay traslado disponible
  // (incluido u opcional): el cliente quiere saber si lo cubrimos antes de reservar,
  // más allá de si lo paga aparte o no.
  const anyTransferAvailable = product.options.some((o) => o.transfer_mode !== 'none');
  const hasDays = product.available_days.length > 0;

  if (!hasDays && !schedule && !neighborhood && !address && !anyDinner && !anyTransfer && !anyTransferAvailable) return null;

  return (
    <div className="rounded-lg border border-gold/10 bg-ink-soft/40 p-5">
      <p className="text-xs uppercase tracking-widest text-gold-soft mb-4">{t('product.house_info_title')}</p>

      <div className="flex flex-col divide-y divide-gold/10">
        {(hasDays || schedule) && (
          <div className="py-4 first:pt-0 last:pb-0">
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

        {(neighborhood || address) && (
          <div className="py-4 first:pt-0 last:pb-0">
            <p className="text-xs text-cream/40 mb-1.5">📍 {t('product.location')}</p>
            {neighborhood && <p className="text-sm text-cream/70">{neighborhood}</p>}
            {address && (
              <p className="mt-1 text-sm text-cream/50 flex items-start gap-1.5">
                <span aria-hidden>📍</span>
                <span>{address}</span>
              </p>
            )}
          </div>
        )}

        {(anyDinner || anyTransfer) && (
          <div className="py-4 first:pt-0 last:pb-0">
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

        {anyTransferAvailable && (
          <div className="py-4 first:pt-0 last:pb-0">
            <p className="text-xs text-cream/40 mb-1.5">🚐 {t('product.transfer_hotels_title')}</p>
            <p className="text-sm text-cream/70 mb-2">{t('product.transfer_hotels_intro')}</p>
            <TransferHotelsInfo />
          </div>
        )}
      </div>
    </div>
  );
}

function BookingSummary({
  product, option, sellerInfo, preview, onBook,
}: {
  product: ProductDetail;
  option: ProductOption | null;
  sellerInfo: SellerPublicInfo | null;
  // Espejo en vivo de la card de opción seleccionada — ver SelectionPreview.
  preview: SelectionPreview;
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
  const showChildPrice = option.price_child_usd != null;
  const showTransferRow = option.transfer_mode !== 'none';
  const urgentDayLabel = urgentDay
    ? new Date(`${urgentDay.date}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    : null;

  // Mismo cálculo que la card de opciones — lo que se ve acá es exactamente lo que
  // se va a cobrar si se confirma con estos botones.
  const { totalUsd } = computeBookingTotals(option, preview.adults, preview.children, preview.transferQty, showChildPrice, preview.infants);
  const totalArs = exchangeRate != null ? Math.round(totalUsd * exchangeRate) : null;

  return (
    <div className="rounded-lg border border-gold/20 bg-ink-soft/80 p-4">
      <p className="text-xs uppercase tracking-widest text-gold-soft">{t('product.your_selection')}</p>
      <h3 className="mt-1.5 font-display text-xl text-cream">
        {localized(option, 'name', lang)}
      </h3>
      <p className="text-sm text-cream/60">{product.venue_name}</p>

      {urgentDayLabel && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold-soft">
          ⚡ Pocos lugares el {urgentDayLabel}
          {urgentDay?.remaining != null ? ` (quedan ${urgentDay.remaining})` : ''}
        </p>
      )}

      {/* Preview sincronizado con la card de la opción: cambia acá apenas se toca
          un stepper o se elige fecha allá, sin que haya que hacer nada más. */}
      <div className="mt-3 divide-y divide-gold/10 text-sm">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-cream/50">{t('checkout.adults')}</span>
          <span className="text-cream/90 font-medium">{preview.adults}</span>
        </div>
        {showChildPrice && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-cream/50">
              {t('product.children')}{product.children_age_label ? ` (${product.children_age_label})` : ''}
            </span>
            <span className="text-cream/90 font-medium">{preview.children}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-1.5">
          <span className="text-cream/50">
            {t('checkout.infants')}{product.infant_age_label ? ` (${product.infant_age_label})` : ''}
          </span>
          <span className="text-cream/90 font-medium">{preview.infants}</span>
        </div>
        {showTransferRow && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-cream/50">{t('checkout.transfer')}</span>
            <span className="text-cream/90 font-medium">
              {option.transfer_mode === 'included' ? t('product.transfer_included') : preview.transferQty}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between py-1.5">
          <span className="text-cream/50">{t('checkout.service_date')}</span>
          <span className={preview.capacityBlocked ? 'text-bordeaux-light font-medium' : preview.date ? 'text-emerald-400 font-medium' : 'text-cream/40'}>
            {preview.date ? formatShortDate(preview.date) : t('product.no_date')}
          </span>
        </div>
      </div>

      {preview.capacityBlocked && (
        <p className="mt-2 text-xs text-bordeaux-light">⚠ {t('product.no_capacity_for_pax')}</p>
      )}

      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-sm text-cream/50">{t('checkout.total')}</span>
        <div className="text-right">
          <p className="text-2xl font-display text-gold leading-tight">USD {totalUsd}</p>
          {totalArs != null && <p className="text-xs text-cream/40">ARS {totalArs.toLocaleString('es-AR')}</p>}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-gold/5 border border-gold/15 px-2.5 py-2 flex gap-2 items-start">
        <span className="text-gold-soft text-sm shrink-0 leading-none mt-0.5">💱</span>
        <p className="text-[11px] text-cream/60 leading-snug">{t(showCard ? 'product.currency_notice_card' : 'product.currency_notice_cash_only')}</p>
      </div>

      <div className="mt-3 space-y-1.5">
        {showCard && (
          <button
            type="button"
            disabled={preview.capacityBlocked}
            onClick={() => onBook('mercadopago')}
            className="btn-primary w-full gap-2 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {CreditCardIcon}
            {showCash ? t('checkout.pay_with_mp') : t('product.book_cta')}
          </button>
        )}
        {showCard && (
          <button
            type="button"
            disabled={preview.capacityBlocked}
            onClick={() => onBook('pix')}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#32BCAD]/40 bg-[#32BCAD]/10 px-6 py-2.5 text-sm font-medium text-[#5fd9cb] hover:bg-[#32BCAD]/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {PixIcon}
            {t('checkout.pay_with_pix')}
          </button>
        )}
        {showCash && (
          <button
            type="button"
            disabled={preview.capacityBlocked}
            onClick={() => onBook('cash')}
            className={`disabled:opacity-40 disabled:cursor-not-allowed ${showCard ? 'btn-ghost w-full py-2.5' : 'btn-primary w-full py-2.5'}`}
          >
            {t('checkout.pay_with_seller')}
          </button>
        )}
        <p className="mt-1 text-xs text-cream/40 text-center">{t(showCard ? 'product.secure_payment_card' : 'product.secure_payment_cash_only')}</p>
      </div>
    </div>
  );
}
