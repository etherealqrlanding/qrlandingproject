import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'es';

  const toggleLang = () => {
    i18n.changeLanguage(lang === 'es' ? 'en' : 'es');
  };

  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-ink/70 border-b border-gold/10">
      <div className="container-narrow flex items-center justify-between h-16">
        <Link to="/" aria-label="Tangos y Milongas Tickets" className="flex items-center">
          <Logo className="h-11 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <Link to="/shows" className="hover:text-gold transition">{t('nav.shows')}</Link>
          <Link to="/nosotros" className="hover:text-gold transition">{t('nav.about')}</Link>
          <Link to="/preguntas-frecuentes" className="hover:text-gold transition">{t('nav.faq')}</Link>
        </nav>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLang}
            className="text-xs uppercase tracking-widest text-gold-soft hover:text-gold transition"
            aria-label="Toggle language"
          >
            {lang === 'es' ? 'EN' : 'ES'}
          </button>
          <Link to="/shows" className="hidden md:inline-flex btn-primary text-sm py-2 px-4">{t('nav.book')}</Link>
        </div>
      </div>
    </header>
  );
}
