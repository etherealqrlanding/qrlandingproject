import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MoreSheet from './MoreSheet';

// Bandera del país de referencia de cada idioma (no una bandera "del idioma" en
// abstracto — ES→Argentina, porque es el mercado principal del sitio).
const LANG_FLAG: Record<string, string> = { es: '🇦🇷', en: '🇺🇸', pt: '🇧🇷' };
const LANG_ORDER = ['es', 'en', 'pt'];

// Rutas que agrupamos dentro de "Más" — para saber si hay que resaltar el
// botón cuando el cliente está parado en una de ellas.
const MORE_PATHS = ['/preguntas-frecuentes', '/nosotros'];

export default function BottomNavPublic() {
  const { t, i18n } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // Si se navega mientras el sheet de "Más" está abierto (ej. desde uno de sus
  // propios links), lo cerramos — evita que quede colgado sobre la pantalla nueva.
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  const lang = LANG_ORDER.includes(i18n.resolvedLanguage ?? 'es') ? (i18n.resolvedLanguage ?? 'es') : 'es';
  const moreActive = MORE_PATHS.some((p) => location.pathname.startsWith(p));

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
      isActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
    }`;

  const tile = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-1.5 rounded-lg py-3.5 transition-colors ${
      isActive ? 'text-gold bg-gold/10' : 'text-cream/70 active:bg-gold/5'
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

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Más opciones"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
            moreActive ? 'text-gold' : 'text-cream/40 active:text-cream/60'
          }`}
        >
          <span className="text-xl leading-none">⋯</span>
          <span className="text-[10px] leading-none mt-0.5">{t('nav.more')}</span>
        </button>
      </div>

      {moreOpen && (
        <MoreSheet title={t('nav.more')} onClose={() => setMoreOpen(false)}>
          <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
            <NavLink to="/preguntas-frecuentes" className={tile}>
              <span className="text-xl leading-none">?</span>
              <span className="text-[11px] leading-none text-center px-1">{t('nav.faq_short')}</span>
            </NavLink>
            <NavLink to="/nosotros" className={tile}>
              <span className="text-xl leading-none">✧</span>
              <span className="text-[11px] leading-none text-center px-1">{t('nav.about')}</span>
            </NavLink>
          </div>

          <div className="px-3 pb-3 pt-1">
            <p className="text-[10px] uppercase tracking-widest text-cream/35 px-2 mb-1.5">{t('nav.language')}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {LANG_ORDER.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => i18n.changeLanguage(code)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 border transition-colors ${
                    lang === code
                      ? 'text-gold bg-gold/10 border-gold/30'
                      : 'text-cream/60 border-transparent active:bg-gold/5'
                  }`}
                >
                  <span className="text-lg leading-none">{LANG_FLAG[code]}</span>
                  <span className="text-[10px] leading-none uppercase tracking-widest">{code}</span>
                </button>
              ))}
            </div>
          </div>
        </MoreSheet>
      )}
    </nav>
  );
}
