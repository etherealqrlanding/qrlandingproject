import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Logo from './Logo';

interface Benefit {
  title: string;
  desc: string;
}

const ShieldIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <path d="M10 2L17 4.5V9.5C17 13.5 14 16.5 10 18C6 16.5 3 13.5 3 9.5V4.5L10 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ClockIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M10 6V10L12.5 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BoltIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <path d="M11 2L4 11.5H9.5L8.5 18L16 8H10.5L11 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const StarIcon = (
  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
    <path d="M10 2.5L12.2 7.3L17.5 8L13.7 11.5L14.7 16.8L10 14.2L5.3 16.8L6.3 11.5L2.5 8L7.8 7.3L10 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const ICONS = [ShieldIcon, ClockIcon, BoltIcon, StarIcon];

interface Props {
  // Tarjeta (Mercado Pago + Pix) habilitada para la cuenta detrás del ref actual
  // (sellers.card_enabled). Default true: es el medio por defecto mientras se
  // resuelve el sellerInfo o si no hay ref cargado todavía.
  showCard?: boolean;
}

export default function PlatformShowcase({ showCard = true }: Props) {
  const { t } = useTranslation();
  const benefits = t('platform.benefits', { returnObjects: true }) as Benefit[];
  // El primer beneficio menciona "pagos con tarjeta" -- si esta cuenta no la tiene
  // habilitada, no podemos prometer un medio de pago que después no va a estar.
  const displayBenefits = showCard ? benefits : [
    { title: t('platform.benefit_cash_only_title'), desc: t('platform.benefit_cash_only_desc') },
    ...benefits.slice(1),
  ];

  return (
    <section className="relative overflow-hidden border-t border-gold/10">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink via-ink-soft/70 to-ink" />
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_15%_10%,#3a4d7350,transparent_55%),radial-gradient(circle_at_85%_80%,#c8a85a35,transparent_55%)]"
      />

      <div className="relative container-narrow py-20 md:py-28 text-center">
        <Logo className="mx-auto h-9 md:h-10 w-auto opacity-90" />

        <p className="mt-7 text-xs uppercase tracking-[0.3em] text-gold-soft">
          {t('platform.eyebrow')}
        </p>
        <h2 className="mt-3 font-display text-4xl md:text-5xl leading-[1.1] text-cream max-w-3xl mx-auto">
          {t('platform.title')}
        </h2>
        <p className="mt-4 text-cream/60 max-w-2xl mx-auto leading-relaxed">
          {t('platform.subtitle')}
        </p>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 text-left">
          {displayBenefits.map((benefit, i) => (
            <div
              key={benefit.title}
              className="rounded-2xl border border-gold/15 bg-ink-soft/40 p-6 transition duration-300 hover:border-gold/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                {ICONS[i % ICONS.length]}
              </span>
              <p className="mt-4 font-medium text-cream">{benefit.title}</p>
              <p className="mt-1.5 text-sm text-cream/60 leading-relaxed">{benefit.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-14">
          <Link to="/shows" className="btn-primary text-base px-8">
            {t('platform.cta')} →
          </Link>
        </div>
      </div>
    </section>
  );
}
