import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';

export default function Contact() {
  const { t } = useTranslation();

  return (
    <section className="container-narrow py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
        {t('nav.contact')}
      </p>
      <h1 className="mt-3 font-display text-5xl text-cream">
        {t('contact.title')}
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-cream/80">
        {t('contact.subtitle')}
      </p>

      <Reveal className="mt-8 max-w-xl rounded-2xl border border-gold/15 bg-ink-soft/40 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="shrink-0 rounded-full bg-gold/10 p-2.5 text-gold">
            <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 6.5 12 13l8-6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="font-display text-2xl text-cream">{t('contact.email_notice_title')}</p>
            <p className="mt-2 text-cream/70 leading-relaxed whitespace-pre-line">
              {t('contact.email_notice_body')}
            </p>
          </div>
        </div>
      </Reveal>

      <div className="mt-6 max-w-xl rounded-2xl border border-gold/10 bg-transparent p-6 sm:p-8">
        <p className="text-cream/70">{t('contact.no_booking_yet')}</p>
        <Link to="/shows" className="btn-ghost mt-3 inline-flex">{t('contact.no_booking_cta')}</Link>
      </div>
    </section>
  );
}
