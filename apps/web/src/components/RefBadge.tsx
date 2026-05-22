import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { getStoredRef, clearRef } from '../lib/referral';
import { api, ApiError } from '../lib/api';

export default function RefBadge() {
  const { t } = useTranslation();
  const location = useLocation();
  const [code, setCode] = useState<string | null>(() => getStoredRef());
  const [name, setName] = useState<string | null>(null);
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    const current = getStoredRef();
    setCode(current);
    setName(null);
    setInactive(false);
    if (!current) return;
    api.checkout.sellerInfo(current)
      .then((info) => setName(info.name))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 410) {
          setInactive(true);
          clearRef();
        }
      });
  }, [location]);

  if (!code) return null;

  if (inactive) {
    return (
      <div className="container-narrow mt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-xs text-amber-400">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M6 5v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <circle cx="6" cy="9" r="0.6" fill="currentColor"/>
          </svg>
          {t('ref.inactive')}
        </div>
      </div>
    );
  }

  return (
    <div className="container-narrow mt-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs text-gold-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
        {t('ref.welcome', { name: name ?? code })}
      </div>
    </div>
  );
}
