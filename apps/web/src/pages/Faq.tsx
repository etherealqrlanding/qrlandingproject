import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { FaqContent } from '../types/api';
import { LoadingBlock } from '../components/Spinner';
import Reveal from '../components/Reveal';
import Collapse from '../components/Collapse';

export default function Faq() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'es';
  const [content, setContent] = useState<FaqContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(0);

  useEffect(() => {
    let cancelled = false;
    api.content.faq()
      .then((data) => { if (!cancelled) setContent(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const items = (content?.items ?? []).map((it) => ({
    q: lang === 'en' ? it.q_en : it.q_es,
    a: lang === 'en' ? it.a_en : it.a_es,
  })).filter((it) => it.q.trim() || it.a.trim());

  return (
    <section className="container-narrow py-6 sm:py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
        {t('nav.faq')}
      </p>
      <h1 className="mt-3 font-display text-5xl text-cream">
        {t('faq.title')}
      </h1>

      {!content && !error && <div className="mt-10"><LoadingBlock /></div>}

      {error && (
        <div className="mt-8 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-4 text-sm text-cream/80">
          {t('faq.error')}: {error}
        </div>
      )}

      {content && items.length === 0 && !error && (
        <p className="mt-8 text-cream/50">{t('faq.empty')}</p>
      )}

      {items.length > 0 && (
        <Reveal className="mt-8 max-w-2xl divide-y divide-gold/10 rounded-2xl border border-gold/15 bg-ink-soft/40">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-gold/5"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-lg text-cream">{it.q}</span>
                  <span className={`shrink-0 text-gold transition-transform ${isOpen ? 'rotate-45' : ''}`}>+</span>
                </button>
                {isOpen && it.a.trim() && (
                  <Collapse className="px-5 pb-5 -mt-1 text-cream/75 leading-relaxed whitespace-pre-line">
                    {it.a}
                  </Collapse>
                )}
              </div>
            );
          })}
        </Reveal>
      )}
    </section>
  );
}
