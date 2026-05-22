import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gold/10 mt-24">
      <div className="container-narrow py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-cream/60">
        <p className="font-display tracking-wide">{t('footer.tagline')}</p>
        <p>© {year} · {t('footer.rights')}</p>
      </div>
    </footer>
  );
}
