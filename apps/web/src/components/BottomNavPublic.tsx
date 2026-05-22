import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function BottomNavPublic() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'es';
  const toggleLang = () => i18n.changeLanguage(lang === 'es' ? 'en' : 'es');

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
      isActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink/96 backdrop-blur-md border-t border-gold/15"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-16 items-stretch">
        <NavLink to="/" end className={tab}>
          <span className="text-xl leading-none">⌂</span>
          <span className="text-[10px] leading-none mt-0.5">{t('nav.home')}</span>
        </NavLink>

        <NavLink to="/shows" className={tab}>
          <span className="text-xl leading-none">✦</span>
          <span className="text-[10px] leading-none mt-0.5">Shows</span>
        </NavLink>

        <a
          href="/#contact"
          className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 text-cream/40 transition-colors active:text-cream/60"
        >
          <span className="text-xl leading-none">✉</span>
          <span className="text-[10px] leading-none mt-0.5">{t('nav.contact')}</span>
        </a>

        <button
          onClick={toggleLang}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 text-cream/40 transition-colors active:text-cream/60"
          aria-label="Toggle language"
        >
          <span className="text-lg leading-none">🌐</span>
          <span className="text-[10px] leading-none mt-0.5 uppercase tracking-widest">
            {lang === 'es' ? 'EN' : 'ES'}
          </span>
        </button>
      </div>
    </nav>
  );
}
