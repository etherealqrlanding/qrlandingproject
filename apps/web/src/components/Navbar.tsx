import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import Logo from './Logo';
import LanguageSwitcher from './LanguageSwitcher';

// Rutas agrupadas dentro del submenú "Más" del navbar de escritorio — para
// resaltar el trigger cuando el cliente está parado en alguna de ellas.
const MORE_PATHS = ['/preguntas-frecuentes', '/nosotros', '/contacto'];

export default function Navbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const moreActive = MORE_PATHS.some((p) => location.pathname.startsWith(p));

  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-ink/70 border-b border-gold/10">
      <div className="container-narrow flex items-center justify-between h-16">
        <Link to="/" aria-label="Tango QR" className="flex items-center">
          <Logo className="h-11 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <Link to="/shows" className="hover:text-gold transition">{t('nav.shows')}</Link>

          <Menu as="div" className="relative">
            <MenuButton
              className={`flex items-center gap-1.5 transition focus:outline-none ${
                moreActive ? 'text-gold' : 'hover:text-gold'
              }`}
            >
              {({ open }) => (
                <>
                  {t('nav.more')}
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    fill="none"
                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  >
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </MenuButton>
            <MenuItems
              transition
              className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-3 w-52 rounded-lg border border-gold/25 bg-ink-soft py-1.5 shadow-2xl shadow-black/50 focus:outline-none transition duration-150 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1"
            >
              <MenuItem>
                <Link to="/preguntas-frecuentes" className="block px-4 py-2.5 text-sm text-cream/90 data-[focus]:bg-gold/10 data-[focus]:text-gold">
                  {t('nav.faq')}
                </Link>
              </MenuItem>
              <MenuItem>
                <Link to="/nosotros" className="block px-4 py-2.5 text-sm text-cream/90 data-[focus]:bg-gold/10 data-[focus]:text-gold">
                  {t('nav.about')}
                </Link>
              </MenuItem>
              <MenuItem>
                <Link to="/contacto" className="block px-4 py-2.5 text-sm text-cream/90 data-[focus]:bg-gold/10 data-[focus]:text-gold">
                  {t('nav.contact')}
                </Link>
              </MenuItem>
            </MenuItems>
          </Menu>
        </nav>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <Link to="/shows" className="hidden md:inline-flex btn-primary text-sm py-2 px-4">{t('nav.book')}</Link>
        </div>
      </div>
    </header>
  );
}
