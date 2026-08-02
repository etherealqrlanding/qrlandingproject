import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { AboutContent } from '../types/api';
import { LoadingBlock } from '../components/Spinner';
import Reveal from '../components/Reveal';

export default function About() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'es';
  const [content, setContent] = useState<AboutContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.content.about()
      .then((data) => { if (!cancelled) setContent(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const title = lang === 'en' ? content?.title_en : content?.title_es;
  const body = lang === 'en' ? content?.body_en : content?.body_es;
  const paragraphs = (body ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="container-narrow py-6 sm:py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
        {t('nav.about')}
      </p>
      <h1 className="mt-3 font-display text-5xl text-cream">
        {title || t('about.default_title')}
      </h1>

      {!content && !error && <div className="mt-10"><LoadingBlock /></div>}

      {error && (
        <div className="mt-8 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-4 text-sm text-cream/80">
          {t('about.error')}: {error}
        </div>
      )}

      {content && paragraphs.length > 0 && (
        <Reveal className="mt-8 max-w-2xl space-y-5 text-lg leading-relaxed text-cream/80">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">{p}</p>
          ))}
        </Reveal>
      )}

      {content && paragraphs.length === 0 && !error && (
        <p className="mt-8 text-cream/50">{t('about.empty')}</p>
      )}
    </section>
  );
}
