import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { ProductSummary } from '../types/api';
import ProductCard from '../components/ProductCard';

export default function ShowsList() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.products.list({ category: 'shows-de-tango' })
      .then((rows) => { if (!cancelled) setProducts(rows); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="container-narrow py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
        {t('categories.shows')}
      </p>
      <h1 className="mt-3 font-display text-5xl text-cream">
        {t('shows.title')}
      </h1>
      <p className="mt-3 max-w-xl text-cream/70">
        {t('shows.subtitle')}
      </p>

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
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}
