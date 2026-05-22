import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type SellerPublicInfo } from '../lib/api';
import type { ProductDetail, ProductOption } from '../types/api';
import { localized, localizedArray } from '../lib/i18nFields';
import { getStoredRef, clearRef } from '../lib/referral';
import { ApiError } from '../lib/api';
import Carousel from '../components/Carousel';
import CheckoutForm from '../components/CheckoutForm';
import { useExchangeRate, fmtArs } from '../lib/useExchangeRate';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'mercadopago' | 'cash'>('mercadopago');
  const [sellerInfo, setSellerInfo] = useState<SellerPublicInfo | null>(null);

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
        setSelectedOptionId(p.options[0]?.id ?? null);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [slug]);


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
  const schedule = localized(product, 'schedule_summary', lang);
  const address = localized(product, 'address', lang);
  const selectedOption = product.options.find((o) => o.id === selectedOptionId) ?? null;

  return (
    <article className="container-narrow py-12">
      <Link to="/shows" className="text-sm text-gold-soft hover:text-gold">
        ← {t('product.back_to_list')}
      </Link>

      <header className="mt-6">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">{product.venue_name}</p>
        <h1 className="mt-2 font-display text-5xl md:text-6xl text-cream leading-[1.05]">
          {product.name}
        </h1>
      </header>

      <div className="mt-8">
        <Carousel images={product.images} />
      </div>

      <div className="mt-12 grid lg:grid-cols-[1fr_360px] gap-10">
        <div>
          {longDescription && (
            <section>
              <h2 className="font-display text-3xl text-cream">{t('product.about')}</h2>
              <p className="mt-4 text-cream/80 leading-relaxed whitespace-pre-line">
                {longDescription}
              </p>
            </section>
          )}

          {schedule && (
            <section className="mt-10">
              <h2 className="font-display text-2xl text-cream">{t('product.schedule')}</h2>
              <p className="mt-3 text-cream/70">{schedule}</p>
              {address && (
                <p className="mt-2 text-sm text-cream/50">📍 {address}</p>
              )}
            </section>
          )}

          <section className="mt-12">
            <h2 className="font-display text-3xl text-cream">{t('product.options_title')}</h2>
            <p className="mt-2 text-cream/60 text-sm">{t('product.options_subtitle')}</p>

            <div className="mt-6 grid gap-4">
              {product.options.map((opt) => (
                <OptionCard
                  key={opt.id}
                  option={opt}
                  selected={opt.id === selectedOptionId}
                  onSelect={() => setSelectedOptionId(opt.id)}
                  lang={lang}
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BookingSummary
            product={product}
            option={selectedOption}
            sellerInfo={sellerInfo}
            onBook={(method) => {
              setCheckoutPaymentMethod(method);
              setCheckoutOpen(true);
            }}
          />
        </aside>
      </div>

      {checkoutOpen && selectedOption && (
        <CheckoutForm
          product={product}
          option={selectedOption}
          onClose={() => setCheckoutOpen(false)}
          initialPaymentMethod={checkoutPaymentMethod}
        />
      )}
    </article>
  );
}

function OptionCard({
  option, selected, onSelect, lang,
}: {
  option: ProductOption;
  selected: boolean;
  onSelect: () => void;
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
  const priceArs = exchangeRate != null ? Math.round(option.price_adult_usd * exchangeRate) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-lg border p-5 transition ${
        selected
          ? 'border-gold/70 bg-gold/5 ring-1 ring-gold/40'
          : 'border-gold/10 bg-ink-soft hover:border-gold/30'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl text-cream">{name}</h3>
          {description && <p className="mt-1 text-sm text-cream/70">{description}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-display text-gold">
            {priceArs != null ? fmtArs(priceArs) : `USD ${option.price_adult_usd}`}
          </p>
          <p className="text-xs text-cream/50">{t('product.per_adult')}</p>
          {priceArs != null && (
            <p className="text-xs text-cream/35">≈ USD {option.price_adult_usd}</p>
          )}
        </div>
      </div>

      {(pickup || dinner || show) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cream/60">
          {pickup && <span>🚐 {pickup}</span>}
          {dinner && <span>🍽 {dinner}</span>}
          {show && <span>🎭 {show}</span>}
        </div>
      )}

      {includes.length > 0 && (
        <ul className="mt-4 space-y-1">
          {includes.map((it, i) => (
            <li key={i} className="text-sm text-cream/75 flex gap-2">
              <span className="text-gold mt-0.5">✓</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}

    </button>
  );
}

function BookingSummary({
  product, option, sellerInfo, onBook,
}: {
  product: ProductDetail;
  option: ProductOption | null;
  sellerInfo: SellerPublicInfo | null;
  onBook: (method: 'mercadopago' | 'cash') => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const exchangeRate = useExchangeRate();

  if (!option) return null;

  const showCash = sellerInfo?.is_permanent === true;
  const priceArs = exchangeRate != null ? Math.round(option.price_adult_usd * exchangeRate) : null;
  const priceChildArs = (exchangeRate != null && option.price_child_usd != null)
    ? Math.round(option.price_child_usd * exchangeRate) : null;

  return (
    <div className="rounded-lg border border-gold/20 bg-ink-soft/80 p-6">
      <p className="text-xs uppercase tracking-widest text-gold-soft">{t('product.your_selection')}</p>
      <h3 className="mt-2 font-display text-2xl text-cream">
        {localized(option, 'name', lang)}
      </h3>
      <p className="text-sm text-cream/60">{product.venue_name}</p>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="text-3xl font-display text-gold">
          {priceArs != null ? fmtArs(priceArs) : `USD ${option.price_adult_usd}`}
        </span>
        <span className="text-sm text-cream/50">/ {t('product.per_adult_short')}</span>
      </div>
      {priceArs != null && (
        <p className="text-xs text-cream/40">≈ USD {option.price_adult_usd}</p>
      )}
      {option.price_child_usd != null && (
        <p className="mt-1 text-xs text-cream/50">
          {t('product.children')}: {priceChildArs != null ? fmtArs(priceChildArs) : `USD ${option.price_child_usd}`}
          {priceChildArs != null && ` (≈ USD ${option.price_child_usd})`}
        </p>
      )}

      {showCash ? (
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => onBook('mercadopago')}
            className="btn-primary w-full"
          >
            {t('checkout.pay_with_mp')}
          </button>
          <button
            type="button"
            onClick={() => onBook('cash')}
            className="btn-ghost w-full"
          >
            {t('checkout.pay_with_seller')}
          </button>
          <p className="mt-1 text-xs text-cream/40 text-center">{t('product.secure_payment')}</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onBook('mercadopago')}
            className="btn-primary w-full mt-6"
          >
            {t('product.book_cta')}
          </button>
          <p className="mt-2 text-xs text-cream/40 text-center">{t('product.secure_payment')}</p>
        </>
      )}
    </div>
  );
}
