import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Bandera del país de referencia de cada idioma (no una bandera "del idioma" en
// abstracto — ES→Argentina, porque es el mercado principal del sitio).
const LANG_FLAG: Record<string, string> = { es: '🇦🇷', en: '🇺🇸', pt: '🇧🇷' };

export default function BottomNavPublic() {
  const { t, i18n } = useTranslation();
  const order = ['es', 'en', 'pt'];
  const lang = order.includes(i18n.resolvedLanguage ?? 'es') ? (i18n.resolvedLanguage ?? 'es') : 'es';
  const cycleLang = () => i18n.changeLanguage(order[(order.indexOf(lang) + 1) % order.length]);

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
      isActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink/[0.97] backdrop-blur-xl border-t border-gold/20"
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

        <NavLink to="/nosotros" className={tab}>
          <span className="text-xl leading-none">✧</span>
          <span className="text-[10px] leading-none mt-0.5">{t('nav.about')}</span>
        </NavLink>

        <NavLink to="/preguntas-frecuentes" className={tab}>
          <span className="text-xl leading-none">?</span>
          <span className="text-[10px] leading-none mt-0.5">{t('nav.faq')}</span>
        </NavLink>

        <button
          onClick={cycleLang}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 text-cream/40 transition-colors active:text-cream/60"
          aria-label="Cambiar idioma"
        >
          <span className="text-lg leading-none">{LANG_FLAG[lang] ?? '🌐'}</span>
          <span className="text-[10px] leading-none mt-0.5 uppercase tracking-widest text-gold">
            {lang.toUpperCase()}
          </span>
        </button>
      </div>
    </nav>
  );
}
