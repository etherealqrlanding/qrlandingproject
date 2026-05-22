import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RefBadge from '../components/RefBadge';
import ProductCard from '../components/ProductCard';
import { api } from '../lib/api';
import type { ProductSummary } from '../types/api';

export default function Home() {
  const { t } = useTranslation();
  const [featured, setFeatured] = useState<ProductSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.products.list({ category: 'shows-de-tango' })
      .then((rows) => { if (!cancelled) setFeatured(rows.slice(0, 3)); })
      .catch(() => { /* silencioso en home; lo verán en /shows */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-bordeaux-deep/40 via-ink to-ink" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,#c8a85a40,transparent_50%),radial-gradient(circle_at_80%_60%,#6b1a2a55,transparent_55%)]"
        />
        <div className="relative container-narrow pt-20 pb-28">
          <RefBadge />
          <p className="mt-8 text-xs uppercase tracking-[0.3em] text-gold-soft">
            {t('hero.eyebrow')}
          </p>
          <h1 className="mt-4 font-display text-5xl md:text-7xl leading-[1.05] text-cream max-w-3xl">
            {t('hero.title')}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-cream/70">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/shows" className="btn-primary">{t('hero.cta_primary')}</Link>
            <a
              href="https://wa.me/5491100000000"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              {t('hero.cta_secondary')}
            </a>
          </div>
        </div>
      </section>

      <section id="shows" className="container-narrow py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
              {t('categories.shows')}
            </p>
            <h2 className="mt-2 font-display text-4xl text-cream">
              {t('home.featured_title')}
            </h2>
          </div>
          <Link to="/shows" className="text-sm text-gold hover:underline">
            {t('home.view_all')} →
          </Link>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.length === 0
            ? [0, 1, 2].map((i) => (
                <div key={i} className="aspect-[4/5] rounded-lg bg-ink-soft animate-pulse" />
              ))
            : featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </>
  );
}
