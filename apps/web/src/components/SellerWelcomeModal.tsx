import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type SellerPublicInfo } from '../lib/api';
import { clearRef } from '../lib/referral';

interface Props {
  code: string;
  onClose: () => void;
}

const KIND_ICONS: Record<string, string> = {
  uber: '🚗',
  hotel: '🏨',
  concierge: '🔑',
  agency: '✈️',
  guide: '🗺️',
  influencer: '📱',
};

export default function SellerWelcomeModal({ code, onClose }: Props) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SellerPublicInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [inactive, setInactive] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.checkout.sellerInfo(code)
      .then(setInfo)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 410) {
          setInactive(true);
          clearRef();
        } else {
          setFailed(true);
        }
      });
  }, [code]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (failed) return null;

  if (inactive) {
    return (
      <div
        ref={backdropRef}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      >
        <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-amber-500/20 bg-[#0d0a0a] shadow-2xl overflow-hidden">
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
          <div className="p-6 pb-8 sm:pb-6">
            <div className="flex items-center justify-between mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <path d="M5 1L9.5 9H0.5L5 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  <path d="M5 4.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <circle cx="5" cy="7.5" r="0.5" fill="currentColor"/>
                </svg>
                {t('seller_inactive.title')}
              </span>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="text-cream/30 hover:text-cream/70 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-cream/70 leading-relaxed mb-6">
              {t('seller_inactive.message')}
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-amber-500/30 px-4 py-3 text-sm font-semibold text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              {t('seller_inactive.cta')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const icon = info?.kind ? (KIND_ICONS[info.kind] ?? '🌟') : '🌟';
  const kindLabel = info?.kind
    ? t(`seller_welcome.kind.${info.kind}`, t('seller_welcome.kind.other'))
    : t('seller_welcome.kind.other');

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-gold/20 bg-[#0d0a0a] shadow-2xl overflow-hidden">
        {/* Barra superior dorada */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-gold/60 to-transparent" />

        <div className="p-6 pb-8 sm:pb-6">
          {/* Badge verificado */}
          <div className="flex items-center justify-between mb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('seller_welcome.badge')}
            </span>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-cream/30 hover:text-cream/70 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>

          {!info ? (
            /* Skeleton de carga */
            <div className="space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/5" />
                <div className="space-y-2 flex-1">
                  <div className="h-6 w-2/3 rounded bg-white/5" />
                  <div className="h-3 w-1/3 rounded bg-white/5" />
                </div>
              </div>
              <div className="h-4 w-full rounded bg-white/5 mt-4" />
              <div className="h-4 w-5/6 rounded bg-white/5" />
            </div>
          ) : (
            <>
              {/* Identidad del vendedor */}
              <div className="flex items-start gap-3 mb-5">
                <span className="text-3xl leading-none mt-0.5" aria-hidden>{icon}</span>
                <div>
                  <p className="font-display text-2xl text-cream leading-tight">{info.name}</p>
                  <p className="text-xs text-gold-soft mt-1">{kindLabel}</p>
                </div>
              </div>

              {/* Mensaje de seguridad */}
              <p className="text-sm text-cream/70 leading-relaxed mb-5">
                {t('seller_welcome.message', { name: info.name })}
              </p>

              {/* Línea divisoria */}
              <div className="border-t border-white/5 mb-5" />

              {/* Pasos */}
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-soft mb-3">
                {t('seller_welcome.steps_title')}
              </p>
              <div className="space-y-3 mb-6">
                {(['step1', 'step2', 'step3'] as const).map((key, i) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="flex-shrink-0 h-5 w-5 rounded-full border border-gold/30 bg-gold/10 flex items-center justify-center text-[10px] font-semibold text-gold">
                      {i + 1}
                    </span>
                    <span className="text-sm text-cream/80">{t(`seller_welcome.${key}`)}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-gold px-4 py-3 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
              >
                {t('seller_welcome.cta')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
