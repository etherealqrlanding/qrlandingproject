import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type SellerPublicInfo } from '../lib/api';
import { clearRef } from '../lib/referral';
import { SELLER_KINDS, sellerKindIcon } from '../lib/sellerKinds';
import PaymentMethods from './PaymentMethods';

interface Props {
  code: string;
  onClose: () => void;
}

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

  // Bloquea el scroll del fondo mientras el modal está abierto — el que tiene
  // que scrollear es el cartel (si no entra completo), no la página de atrás.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (failed) return null;

  if (inactive) {
    return (
      <div
        ref={backdropRef}
        className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-modal-backdrop"
        onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      >
        <div className="relative w-full sm:max-w-sm rounded-2xl border border-amber-500/20 bg-[#0d0a0a] shadow-2xl overflow-hidden animate-modal-panel">
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

  const icon = sellerKindIcon(info?.kind);
  // Perfil reconocido (uno de los 6 definidos) → mensaje/pasos a medida. Vendedor
  // sin perfil asignado o con un valor viejo/no reconocido → mensaje genérico.
  const isKnownKind = Boolean(info?.kind) && SELLER_KINDS.some((k) => k.value === info?.kind);
  const profileKey = isKnownKind ? (info?.kind as string) : 'default';
  const kindLabel = isKnownKind ? t(`seller_welcome.kind.${profileKey}`) : null;
  const trustBadge = isKnownKind ? t(`seller_welcome.trust_badge.${profileKey}`) : null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-modal-backdrop"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="relative w-full sm:max-w-sm rounded-2xl border border-gold/20 bg-[#0d0a0a] shadow-2xl overflow-hidden animate-modal-panel">
        {/* Barra superior dorada */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-gold/60 to-transparent" />

        <div className="p-5 pb-6 sm:pb-5">
          {/* Badge — a medida del perfil (ej. "Recomendado por tu Hotel"); si el
              vendedor no tiene un perfil reconocido, cae al genérico "Vendedor Verificado". */}
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {trustBadge ?? t('seller_welcome.badge')}
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
              <div className="flex items-start gap-2.5 mb-3">
                <span className="text-2xl leading-none mt-0.5" aria-hidden>{icon}</span>
                <div>
                  <p className="font-display text-xl text-cream leading-tight">{info.name}</p>
                  {kindLabel && <p className="text-xs text-gold-soft mt-0.5">{kindLabel}</p>}
                </div>
              </div>

              {/* Mensaje de seguridad — a medida del perfil del vendedor */}
              <p className="text-xs text-cream/70 leading-snug mb-3">
                {t(`seller_welcome.message.${profileKey}`, { name: info.name })}
              </p>

              {/* Línea divisoria */}
              <div className="border-t border-white/5 mb-3" />

              {/* Pasos — también a medida del perfil (ej. Recepción/Agencias mencionan
                  la opción de pagar en efectivo ahí mismo) */}
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-soft mb-2">
                {t('seller_welcome.steps_title')}
              </p>
              <div className="space-y-1.5 mb-3">
                {(['step1', 'step2', 'step3'] as const).map((key, i) => {
                  // El paso 3 (cómo se paga) no puede depender solo del perfil sugerido en
                  // el admin -- tiene que reflejar los medios REALMENTE habilitados para
                  // esta cuenta puntual (is_permanent/card_enabled), o termina prometiendo
                  // un medio de pago que después no aparece como opción real.
                  const stepText = key === 'step3'
                    ? t(info.card_enabled && info.is_permanent
                        ? 'product.how_to_book_step3_card_cash'
                        : info.card_enabled
                          ? 'product.how_to_book_step3_card_only'
                          : 'product.how_to_book_step3_cash_only')
                    : t(`seller_welcome.steps.${profileKey}.${key}`);
                  return (
                    <div key={key} className="flex items-center gap-2.5">
                      <span className="flex-shrink-0 h-4 w-4 rounded-full border border-gold/30 bg-gold/10 flex items-center justify-center text-[9px] font-semibold text-gold">
                        {i + 1}
                      </span>
                      <span className="text-xs text-cream/80 leading-snug">{stepText}</span>
                    </div>
                  );
                })}
              </div>

              {/* Medios de pago — efectivo solo si este vendedor lo tiene habilitado
                  (flag real is_permanent; el perfil solo lo sugiere en el admin). */}
              <PaymentMethods variant="detailed" className="mb-4" showCash={info.is_permanent} showCard={info.card_enabled} />

              {/* CTA */}
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink hover:bg-gold/90 transition-colors"
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
