import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import LanguageSwitcher from './LanguageSwitcher';
import { api, ApiError } from '../lib/api';
import { isValidRef } from '../lib/referral';

/**
 * Muro de acceso: la plataforma es exclusiva de la red de vendedores.
 * Sin un código de vendedor válido no se puede acceder ni reservar.
 * Incluye un input para que quien ya tenga el código lo ingrese directamente.
 */
export default function AccessGate({
  reason,
  onValid,
}: {
  reason: 'missing' | 'invalid';
  onValid: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    setError(null);
    if (!isValidRef(value)) {
      setError(t('gate.code_invalid'));
      return;
    }
    setSubmitting(true);
    try {
      await api.checkout.sellerInfo(value);
      onValid(value);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setError(t('gate.code_inactive'));
      else if (err instanceof ApiError && err.status === 404) setError(t('gate.code_invalid'));
      else setError(t('gate.code_error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-ink">
      <div className="fixed top-5 right-6 z-10"><LanguageSwitcher /></div>

      <div className="min-h-full flex flex-col items-center justify-center px-6 py-8 text-center">
        <Logo className="h-16 md:h-20 w-auto" />

        <div className="mt-6 max-w-md w-full">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-xs uppercase tracking-widest text-gold-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {t('gate.badge')}
          </span>

          <h1 className="mt-4 font-display text-2xl md:text-3xl text-cream leading-tight">
            {t('gate.title')}
          </h1>

          <p className="mt-3 text-sm text-cream/70 leading-relaxed">
            {t('gate.message')}
          </p>

          {reason === 'invalid' && !error && (
            <div className="mt-4 rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-2.5 text-sm text-cream/80">
              {t('gate.invalid')}
            </div>
          )}

          <form onSubmit={submit} className="mt-5">
            <label className="block text-xs uppercase tracking-widest text-gold-soft/80">
              {t('gate.have_code')}
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => { setCode(e.target.value); if (error) setError(null); }}
                placeholder={t('gate.placeholder')}
                autoCapitalize="characters"
                autoComplete="off"
                className="input text-center tracking-widest"
                aria-label={t('gate.placeholder')}
              />
              <button type="submit" disabled={submitting} className="btn-primary shrink-0 disabled:opacity-50">
                {submitting ? t('gate.checking') : t('gate.enter')}
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-bordeaux-light">{error}</p>}
          </form>

          <p className="mt-5 text-xs uppercase tracking-[0.25em] text-cream/40">
            {t('gate.footer')}
          </p>
        </div>
      </div>
    </div>
  );
}
