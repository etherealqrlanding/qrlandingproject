import { useTranslation } from 'react-i18next';

function PixIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M10 2L18 10L10 18L2 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M10 2L17 4.5V9.5C17 13.5 14 16.5 10 18C6 16.5 3 13.5 3 9.5V4.5L10 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="2" y="5" width="16" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 8.5H18" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 13H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="2" y="6" width="16" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

interface PaymentMethodsProps {
  /** compact: una línea chica para el hero. detailed: tarjeta con badges para el modal de bienvenida. */
  variant?: 'compact' | 'detailed';
  className?: string;
  /** Este vendedor tiene habilitado el cobro en efectivo (sellers.is_permanent) —
   * suma el badge de Efectivo. Default false: la mayoría de los perfiles no lo ofrece. */
  showCash?: boolean;
}

/**
 * Comunica los medios de pago disponibles (tarjeta, vía Mercado Pago por detrás,
 * + PIX próximamente) para generar confianza en el cliente apenas llega. Se
 * muestra "Tarjeta" en vez de la marca Mercado Pago para que un turista de
 * cualquier país entienda de inmediato que puede pagar con su tarjeta.
 */
export default function PaymentMethods({ variant = 'compact', className = '', showCash = false }: PaymentMethodsProps) {
  const { t } = useTranslation();

  if (variant === 'detailed') {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 ${className}`}>
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-cream/70 mb-2">
          <ShieldIcon className="h-3.5 w-3.5 text-gold" />
          {t('payment_methods.secure_note')}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {showCash && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <CashIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{t('payment_methods.cash_short')}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold-soft">
            <CreditCardIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{t('payment_methods.card_brands')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#32BCAD]/30 bg-[#32BCAD]/10 px-2.5 py-1 text-[11px] font-medium text-[#5fd9cb]">
            <PixIcon className="h-3 w-3" />
            PIX
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm text-cream/60">
        <span className="inline-flex items-center gap-2">
          <ShieldIcon className="h-5 w-5 text-gold" />
          {t('payment_methods.secure_note')}
        </span>
        {showCash && (
          <>
            <span aria-hidden className="hidden sm:block h-5 w-px bg-cream/15" />
            <span className="inline-flex items-center gap-2">
              <CashIcon className="h-5 w-5 text-emerald-400 shrink-0" />
              <b className="font-medium text-cream/80">{t('payment_methods.cash_short')}</b>
            </span>
          </>
        )}
        <span aria-hidden className="hidden sm:block h-5 w-px bg-cream/15" />
        <span className="inline-flex items-center gap-2">
          <CreditCardIcon className="h-6 w-6 text-gold shrink-0" />
          <b className="font-medium text-cream/80">{t('payment_methods.card_label')}</b>
          <span className="hidden sm:inline text-cream/40">· {t('payment_methods.mp_types_short')}</span>
        </span>
        <span aria-hidden className="hidden sm:block h-5 w-px bg-cream/15" />
        <span className="inline-flex items-center gap-2">
          <PixIcon className="h-5 w-5 text-[#5fd9cb]" />
          <b className="font-medium text-cream/80">PIX</b>
          <span className="hidden sm:inline text-cream/40">· {t('payment_methods.pix_reais')}</span>
        </span>
      </div>
      <p className="mt-2 text-center text-xs text-cream/40">{t('payment_methods.currency_note')}</p>
    </div>
  );
}
