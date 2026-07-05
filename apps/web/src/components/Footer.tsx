import { useTranslation } from 'react-i18next';
import Logo from './Logo';

export default function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gold/10 mt-24">
      <div className="container-narrow py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-cream/60">
        <div className="flex flex-col items-center md:items-start gap-3">
          <Logo className="h-14 w-auto" />
          <p className="font-display tracking-wide">{t('footer.tagline')}</p>
        </div>
        <p>© {year} · {t('footer.rights')}</p>
      </div>
    </footer>
  );
}
