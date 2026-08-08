import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { getStoredRef, clearRef } from '../lib/referral';
import { api, ApiError, type SellerPublicInfo } from '../lib/api';

export default function RefBadge() {
  const { t } = useTranslation();
  const location = useLocation();
  const [code, setCode] = useState<string | null>(() => getStoredRef());
  const [inactive, setInactive] = useState(false);
  const [info, setInfo] = useState<SellerPublicInfo | null>(null);

  useEffect(() => {
    const current = getStoredRef();
    setCode(current);
    setInactive(false);
    setInfo(null);
    if (!current) return;
    api.checkout.sellerInfo(current)
      .then(setInfo)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 410) {
          setInactive(true);
          clearRef();
        }
      });
  }, [location]);

  if (!code) return null;

  // Código inactivo: aviso genérico, no exhibimos el vínculo cliente-vendedor.
  if (inactive) {
    return (
      <div className="container-narrow mt-1">
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

  // Código activo, vendedor normal: no mostramos nada — el ref sigue funcionando
  // (comisión, exclusividad de acceso) pero sin exhibir el vínculo cliente-vendedor.
  const branding = info?.branding;
  const hasBranding = Boolean(branding && (branding.logo_url || branding.tagline || branding.public_phone));
  if (!hasBranding || !branding) return null;

  // Código activo Y el vendedor es un socio comercial con personalización habilitada:
  // cintillo discreto con lo que el vendedor cargó (logo/lema/teléfono) — sin ningún
  // texto armado por nosotros, solo lo que él decidió mostrar.
  return (
    <div className="container-narrow mt-1">
      <div className="flex items-center gap-3 rounded-xl border border-gold/15 bg-ink-soft/40 px-4 py-2.5">
        {branding.logo_url && (
          <img src={branding.logo_url} alt="" className="h-8 w-8 rounded object-contain shrink-0" />
        )}
        {branding.tagline && (
          <p className="min-w-0 text-xs text-cream/80 line-clamp-2">{branding.tagline}</p>
        )}
        {branding.public_phone && (
          <span className="ml-auto shrink-0 text-[11px] text-gold-soft whitespace-nowrap hidden sm:inline">
            {branding.public_phone}
          </span>
        )}
      </div>
    </div>
  );
}
