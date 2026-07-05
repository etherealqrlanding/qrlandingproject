import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
  { code: 'pt', label: 'PT' },
] as const;

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'es';

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-widest ${className}`}>
      {LANGS.map((l, i) => (
        <Fragment key={l.code}>
          {i > 0 && <span className="text-cream/20">·</span>}
          <button
            type="button"
            onClick={() => i18n.changeLanguage(l.code)}
            aria-label={`Cambiar idioma a ${l.label}`}
            aria-current={current === l.code}
            className={`transition ${current === l.code ? 'text-gold' : 'text-gold-soft/50 hover:text-gold'}`}
          >
            {l.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
