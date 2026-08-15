import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RefBadge from '../components/RefBadge';
import Logo from '../components/Logo';
import ProductCard from '../components/ProductCard';
import HeroSlideshow from '../components/HeroSlideshow';
import QuickSelect from '../components/QuickSelect';
import PaymentMethods from '../components/PaymentMethods';
import PlatformShowcase from '../components/PlatformShowcase';
import ShareButton from '../components/ShareButton';
import Reveal from '../components/Reveal';
import { api, type SellerPublicInfo } from '../lib/api';
import { localized, localizedArray } from '../lib/i18nFields';
import { useExchangeRate, fmtArs } from '../lib/useExchangeRate';
import { getStoredRef } from '../lib/referral';
import { buildShareUrl } from '../lib/shareLinks';
import type { ProductDetail, ProductSummary } from '../types/api';

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const HouseIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <path d="M3 9.5L10 3.5L17 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 8.5V16.5H15V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 16.5V12H12V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ServiceIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <path d="M10 2.5L12.2 7.3L17.5 8L13.7 11.5L14.7 16.8L10 14.2L5.3 16.8L6.3 11.5L2.5 8L7.8 7.3L10 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const DinnerIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden>
    <path d="M5 2.5v5.5a1.5 1.5 0 003 0V2.5M6.5 2.5V18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.5 2.5c-1.4 0-2.5 1.6-2.5 4s1.1 3.2 2 3.6V18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TransferIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden>
    <path d="M2 12.5V7a1 1 0 011-1h9l3 3.5h2a1 1 0 011 1v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12.5h16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="6" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="15" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

interface HeroStep {
  title: string;
  desc: string;
}

const HOUSES_CATEGORY = 'shows-de-tango';

export default function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const navigate = useNavigate();
  const exchangeRate = useExchangeRate();
  const [featured, setFeatured] = useState<ProductSummary[]>([]);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [houses, setHouses] = useState<ProductSummary[]>([]);
  const [selectedHouseSlug, setSelectedHouseSlug] = useState('');
  const [selectedHouseDetail, setSelectedHouseDetail] = useState<ProductDetail | null>(null);
  const [sellerInfo, setSellerInfo] = useState<SellerPublicInfo | null>(null);
  const steps = t('hero.steps', { returnObjects: true }) as HeroStep[];
  // Mismo criterio que ProductPage: tarjeta es el medio por defecto (arranca mostrado
  // mientras carga sellerInfo), efectivo es la excepción (arranca oculto).
  const showCardMethods = sellerInfo?.card_enabled !== false;
  const showCashMethod = sellerInfo?.is_permanent === true;

  useEffect(() => {
    const code = getStoredRef();
    if (!code) return;
    api.checkout.sellerInfo(code).then(setSellerInfo).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.products.list({ category: HOUSES_CATEGORY })
      .then((rows) => {
        if (cancelled) return;
        setHouses(rows);
        setFeatured(rows.slice(0, 9));
        // El slide del hero arranca con Tango Porteño primero (pedido puntual) — el
        // resto del orden (listado de casas, destacadas) no se toca.
        const heroOrder = [...rows].sort((a, b) => {
          if (a.slug === 'tango-porteno') return -1;
          if (b.slug === 'tango-porteno') return 1;
          return 0;
        });
        setHeroImages(
          heroOrder.map((r) => r.hero_image).filter((u): u is string => !!u).slice(0, 5),
        );
      })
      .catch(() => { /* silencioso en home; lo verán en /shows */ });
    return () => { cancelled = true; };
  }, []);

  // Selector rápido del hero: primero se elige la casa, y recién ahí se cargan
  // sus servicios (los "tiers" / product_options de esa casa) para elegir directo.
  function handleHouseSelect(slug: string) {
    setSelectedHouseSlug(slug);
    setSelectedHouseDetail(null);
    if (!slug) return;
    api.products.bySlug(slug)
      .then(setSelectedHouseDetail)
      .catch(() => setSelectedHouseDetail(null));
  }

  function handleServiceSelect(optionId: string) {
    if (optionId && selectedHouseSlug) {
      navigate(`/shows/${selectedHouseSlug}?option=${optionId}`);
    }
  }

  return (
    <>
      <section className="relative overflow-hidden">
        <HeroSlideshow images={heroImages} />
        {/* Oscurecido para legibilidad del texto sobre las fotos */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink/80 via-ink/85 to-ink" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_20%,#c8a85a40,transparent_50%),radial-gradient(circle_at_80%_60%,#3a4d7355,transparent_55%)]"
        />
        <div className="relative container-narrow pt-4 sm:pt-6 pb-16 md:pb-24 min-h-0 md:min-h-[85vh] flex flex-col items-center justify-center text-center">
          <RefBadge />
          <Logo tagline={false} className="mt-1 sm:mt-2 h-10 sm:h-12 md:h-14 w-auto" />
          <p className="mt-1.5 sm:mt-3 text-[9px] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.3em] text-gold-soft px-4">
            {t('hero.eyebrow')}
          </p>
          <h1 className="mt-1 sm:mt-1.5 font-display text-3xl md:text-4xl leading-[1.05] text-cream max-w-3xl">
            {t('hero.title')}
          </h1>

          <div className="mt-3.5 sm:mt-5 w-full max-w-3xl rounded-2xl border-2 border-gold/40 bg-ink-soft/80 backdrop-blur-sm p-4 sm:p-5 md:p-7 shadow-2xl shadow-gold/10">
            <p className="font-display text-lg sm:text-xl md:text-2xl text-gold">
              {t('hero.quick_select.label')}
            </p>
            <p className="mt-1 text-xs sm:text-sm text-cream/60">
              {t('hero.quick_select.subtitle')}
            </p>

            <div className="mt-3 sm:mt-4 grid sm:grid-cols-2 gap-2.5 sm:gap-4 text-left">
              <QuickSelect
                label={t('hero.quick_select.group_houses')}
                icon={HouseIcon}
                placeholder={t('hero.quick_select.placeholder_house')}
                value={selectedHouseSlug}
                onChange={handleHouseSelect}
                options={houses.map((p) => {
                  const services = localizedArray(p, 'option_names', lang);
                  const shortDesc = localized(p, 'short_description', lang);
                  // Mostramos siempre la lista completa de servicios de la casa (no un conteo),
                  // compacta y con quiebre de línea en vez de cortarse con "...".
                  const meta = services.length > 0
                    ? services.join(' · ')
                    : (shortDesc ? truncate(shortDesc, 90) : undefined);
                  return {
                    value: p.slug,
                    label: p.name,
                    price: p.starting_price_usd != null
                      ? t('hero.quick_select.from_price', { price: p.starting_price_usd })
                      : undefined,
                    meta,
                    thumbnail: p.hero_image,
                  };
                })}
              />

              <QuickSelect
                label={t('hero.quick_select.group_services')}
                icon={ServiceIcon}
                placeholder={
                  !selectedHouseSlug
                    ? t('hero.quick_select.placeholder_service_locked')
                    : !selectedHouseDetail
                    ? t('hero.quick_select.loading')
                    : t('hero.quick_select.placeholder_service')
                }
                value=""
                onChange={handleServiceSelect}
                disabled={!selectedHouseDetail}
                loading={Boolean(selectedHouseSlug) && !selectedHouseDetail}
                options={(selectedHouseDetail?.options ?? []).map((opt) => {
                  const description = localized(opt, 'description', lang);
                  const tags: { icon: typeof DinnerIcon; label: string }[] = [];
                  if (opt.has_dinner) tags.push({ icon: DinnerIcon, label: t('hero.quick_select.tag_dinner') });
                  if (opt.transfer_mode === 'included') tags.push({ icon: TransferIcon, label: t('hero.quick_select.tag_transfer_included') });
                  else if (opt.transfer_mode === 'optional') tags.push({ icon: TransferIcon, label: t('hero.quick_select.tag_transfer') });
                  const usdPrice = t('hero.quick_select.price_badge', { price: opt.price_adult_usd });
                  const price = exchangeRate != null
                    ? `${usdPrice} · ${fmtArs(opt.price_adult_usd * exchangeRate)}`
                    : usdPrice;
                  return {
                    value: String(opt.id),
                    label: localized(opt, 'name', lang) ?? '',
                    price,
                    tags,
                    meta: description ? truncate(description, 70) : undefined,
                    thumbnail: selectedHouseDetail?.hero_image,
                  };
                })}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link to="/shows" className="btn-primary rounded-full px-8 py-3.5 text-base shadow-lg shadow-gold/20">
              {t('hero.cta_primary')}
            </Link>
            <ShareButton
              url={buildShareUrl('/', getStoredRef())}
              title={t('hero.title')}
              waMessage={t('share.site_message', { link: buildShareUrl('/', getStoredRef()) })}
              label={`↗ ${t('share.button')}`}
            />
          </div>

          <PaymentMethods variant="compact" className="mt-6" showCash={showCashMethod} showCard={showCardMethods} />

          {/* Cómo funciona: guía para el cliente que recién llega por el QR del vendedor */}
          <Reveal className="mt-16 w-full text-left rounded-2xl border border-gold/15 bg-ink-soft/40 p-6 md:p-8">
            <p className="font-display text-2xl text-cream">{t('hero.how_title')}</p>
            <p className="mt-1 text-sm text-cream/60 max-w-2xl">{t('hero.how_subtitle')}</p>

            <ol className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.title} className="relative">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-display text-lg text-gold">
                      {i + 1}
                    </span>
                    {i < steps.length - 1 && (
                      <span aria-hidden className="hidden lg:block h-px flex-1 bg-gradient-to-r from-gold/30 to-transparent" />
                    )}
                  </div>
                  <p className="mt-3 font-medium text-cream">{step.title}</p>
                  <p className="mt-1 text-sm text-cream/60 leading-relaxed">{step.desc}</p>
                </li>
              ))}
            </ol>

            <div className="mt-7">
              <Link to="/shows" className="btn-primary">{t('hero.cta_primary')}</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Reveal as="section" id="shows" className="container-narrow py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
              {t('categories.shows')}
            </p>
            <h2 className="mt-2 font-display text-4xl text-cream">
              {t('home.featured_title')}
            </h2>
          </div>
          <Link
            to="/shows"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-4 py-2 text-sm text-gold hover:bg-gold/10 transition"
          >
            {t('home.view_all')}{houses.length > 0 ? ` (${houses.length})` : ''} →
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {featured.length === 0
            ? Array.from({ length: 9 }, (_, i) => (
                <div
                  key={i}
                  className={`aspect-[4/3] sm:aspect-[4/5] rounded-lg bg-ink-soft animate-pulse ${i === 8 ? 'hidden lg:block' : ''}`}
                />
              ))
            : featured.map((p, i) => (
                <Reveal key={p.id} pop delay={i * 60} className={i === 8 ? 'hidden lg:block' : undefined}>
                  <ProductCard product={p} />
                </Reveal>
              ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link to="/shows" className="btn-primary text-base px-8">
            {t('home.view_all_cta')}{houses.length > 0 ? ` (${houses.length})` : ''} →
          </Link>
        </div>
      </Reveal>

      <Reveal>
        <PlatformShowcase showCard={showCardMethods} />
      </Reveal>
    </>
  );
}
