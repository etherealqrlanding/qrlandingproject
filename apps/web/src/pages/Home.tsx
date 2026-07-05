import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RefBadge from '../components/RefBadge';
import Logo from '../components/Logo';
import ProductCard from '../components/ProductCard';
import HeroSlideshow from '../components/HeroSlideshow';
import { api } from '../lib/api';
import type { ProductSummary } from '../types/api';

interface HeroStep {
  title: string;
  desc: string;
}

export default function Home() {
  const { t } = useTranslation();
  const [featured, setFeatured] = useState<ProductSummary[]>([]);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const steps = t('hero.steps', { returnObjects: true }) as HeroStep[];

  useEffect(() => {
    let cancelled = false;
    api.products.list({ category: 'shows-de-tango' })
      .then((rows) => {
        if (cancelled) return;
        setFeatured(rows.slice(0, 6));
        setHeroImages(
          rows.map((r) => r.hero_image).filter((u): u is string => !!u).slice(0, 5),
        );
      })
      .catch(() => { /* silencioso en home; lo verán en /shows */ });
    return () => { cancelled = true; };
  }, []);

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
        <div className="relative container-narrow pt-20 pb-28">
          <RefBadge />
          <Logo className="mt-8 h-28 md:h-36 w-auto" />
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

          {/* Cómo funciona: guía para el cliente que recién llega por el QR del vendedor */}
          <div className="mt-16 rounded-2xl border border-gold/15 bg-ink-soft/40 p-6 md:p-8">
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
          <Link
            to="/shows"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-4 py-2 text-sm text-gold hover:bg-gold/10 transition"
          >
            {t('home.view_all')} →
          </Link>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.length === 0
            ? [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="aspect-[4/5] rounded-lg bg-ink-soft animate-pulse" />
              ))
            : featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>

        <div className="mt-12 flex justify-center">
          <Link to="/shows" className="btn-primary text-base px-8">
            {t('home.view_all_cta')} →
          </Link>
        </div>
      </section>
    </>
  );
}
