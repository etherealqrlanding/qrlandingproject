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

interface PaymentMethodsProps {
  /** compact: una línea chica para el hero. detailed: tarjeta con badges para el modal de bienvenida. */
  variant?: 'compact' | 'detailed';
  className?: string;
}

/**
 * Comunica los medios de pago disponibles (Mercado Pago + PIX próximamente)
 * para generar confianza en el cliente apenas llega. Mercado Pago usa el
 * ísotipo oficial (public/mercadopagolog.png, sin wordmark); PIX todavía no
 * tiene logo propio en el proyecto, así que usa un ícono genérico + el
 * verde-azulado de marca.
 */
export default function PaymentMethods({ variant = 'compact', className = '' }: PaymentMethodsProps) {
  const { t } = useTranslation();

  if (variant === 'detailed') {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-cream/70 mb-3">
          <ShieldIcon className="h-3.5 w-3.5 text-gold" />
          {t('payment_methods.secure_note')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00b1ea]/30 bg-[#00b1ea]/10 px-2.5 py-1 text-[11px] font-medium text-[#5fd0f3]">
            <img src="/mercadopagolog.png" alt="" className="h-4 w-auto shrink-0" />
            <span>Mercado Pago</span>
          </span>
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-cream/50">
            {t('payment_methods.mp_credit')}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-cream/50">
            {t('payment_methods.mp_debit')}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-cream/50">
            {t('payment_methods.mp_wallet')}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#32BCAD]/30 bg-[#32BCAD]/10 px-2.5 py-1 text-[11px] font-medium text-[#5fd9cb]">
            <PixIcon className="h-3 w-3" />
            PIX
            <span className="text-[#5fd9cb]/60">({t('payment_methods.pix_soon')})</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm text-cream/60 ${className}`}
    >
      <span className="inline-flex items-center gap-2">
        <ShieldIcon className="h-5 w-5 text-gold" />
        {t('payment_methods.secure_note')}
      </span>
      <span aria-hidden className="hidden sm:block h-5 w-px bg-cream/15" />
      <span className="inline-flex items-center gap-2">
        <img src="/mercadopagolog.png" alt="" className="h-7 w-auto shrink-0" />
        <b className="font-medium text-cream/80">Mercado Pago</b>
        <span className="hidden sm:inline text-cream/40">· {t('payment_methods.mp_types_short')}</span>
      </span>
      <span aria-hidden className="hidden sm:block h-5 w-px bg-cream/15" />
      <span className="inline-flex items-center gap-2">
        <PixIcon className="h-5 w-5 text-[#5fd9cb]" />
        <b className="font-medium text-cream/80">PIX</b>
        <span className="text-cream/40">({t('payment_methods.pix_soon')})</span>
      </span>
    </div>
  );
}
