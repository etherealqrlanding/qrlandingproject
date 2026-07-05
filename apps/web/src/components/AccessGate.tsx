import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import LanguageSwitcher from './LanguageSwitcher';

/**
 * Muro de acceso: la plataforma es exclusiva de la red de vendedores.
 * Sin un código de vendedor válido no se puede acceder ni reservar.
 */
export default function AccessGate({ reason }: { reason: 'missing' | 'invalid' }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-ink px-6 text-center">
      <div className="absolute top-5 right-6"><LanguageSwitcher /></div>

      <Logo className="h-24 md:h-28 w-auto" />

      <div className="mt-10 max-w-md">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs uppercase tracking-widest text-gold-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          {t('gate.badge')}
        </span>

        <h1 className="mt-6 font-display text-3xl md:text-4xl text-cream leading-tight">
          {t('gate.title')}
        </h1>

        <p className="mt-4 text-cream/70 leading-relaxed">
          {t('gate.message')}
        </p>

        {reason === 'invalid' && (
          <div className="mt-6 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/80">
            {t('gate.invalid')}
          </div>
        )}

        <p className="mt-8 text-xs uppercase tracking-[0.25em] text-cream/40">
          {t('gate.footer')}
        </p>
      </div>
    </div>
  );
}
