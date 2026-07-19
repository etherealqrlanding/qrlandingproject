import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { ProductSummary } from '../types/api';
import ProductCard from '../components/ProductCard';
import ShareButton from '../components/ShareButton';
import { getStoredRef } from '../lib/referral';
import { buildShareUrl } from '../lib/shareLinks';

// Recuerda la última casa que se abrió desde este listado (una sola lectura, se
// consume al volver). App.tsx resetea el scroll a top en cada cambio de ruta, así
// que sin esto se pierde por completo la posición al volver del detalle.
const LAST_VIEWED_KEY = 'lastViewedShowSlug';

export default function ShowsList() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedSlug, setHighlightedSlug] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.products.list({ category: 'shows-de-tango' })
      .then((rows) => { if (!cancelled) setProducts(rows); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Al volver del detalle de una casa, restauramos el scroll a esa card y la
  // resaltamos un instante para que sea fácil ubicar desde dónde se venía.
  useEffect(() => {
    if (!products) return;
    const slug = sessionStorage.getItem(LAST_VIEWED_KEY);
    if (!slug || !products.some((p) => p.slug === slug)) return;
    sessionStorage.removeItem(LAST_VIEWED_KEY);
    setHighlightedSlug(slug);
    const raf = requestAnimationFrame(() => {
      highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timeout = setTimeout(() => setHighlightedSlug(null), 2200);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
  }, [products]);

  return (
    <section className="container-narrow py-16">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
            {t('categories.shows')}
          </p>
          <h1 className="mt-3 font-display text-5xl text-cream">
            {products && products.length > 0
              ? t('shows.title', { count: products.length })
              : t('shows.title_fallback')}
          </h1>
          <p className="mt-3 max-w-xl text-cream/70">
            {t('shows.subtitle')}
          </p>
        </div>
        <ShareButton
          url={buildShareUrl('/shows', getStoredRef())}
          title={t('shows.title')}
          waMessage={t('share.shows_message', { link: buildShareUrl('/shows', getStoredRef()) })}
          label={`↗ ${t('share.button')}`}
        />
      </div>

      {error && (
        <div className="mt-8 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-4 text-sm text-cream/80">
          {t('shows.error')}: {error}
        </div>
      )}

      {!products && !error && (
        <div className="mt-10 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[4/3] sm:aspect-[4/5] rounded-lg bg-ink-soft animate-pulse" />
          ))}
        </div>
      )}

      {products && products.length === 0 && (
        <p className="mt-10 text-cream/60">{t('shows.empty')}</p>
      )}

      {products && products.length > 0 && (
        <div className="mt-10 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              highlighted={p.slug === highlightedSlug}
              ref={p.slug === highlightedSlug ? highlightedRef : undefined}
              onNavigate={() => sessionStorage.setItem(LAST_VIEWED_KEY, p.slug)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
