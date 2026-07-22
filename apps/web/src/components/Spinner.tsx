interface SpinnerProps {
  /** Diámetro del spinner. sm: inline, md: bloques, lg: pantalla completa. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

/** Círculo animado en color dorado. Para usar inline o dentro de botones. */
export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block animate-spin rounded-full border-gold/30 border-t-gold ${SIZES[size]} ${className}`}
    />
  );
}

const BRAND_SIZES: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
};

/**
 * Loader de marca: el isotipo de Tangos y Milongas dentro de un anillo dorado que gira,
 * con un halo tenue que late. Para estados de carga grandes (pantalla completa / secciones);
 * los botones siguen usando <Spinner> chico (un isotipo de 16px no se leería).
 */
export function BrandSpinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`relative inline-flex items-center justify-center ${BRAND_SIZES[size]} ${className}`}
    >
      {/* halo dorado tenue que late */}
      <span aria-hidden className="absolute inset-1 rounded-full bg-gold/10 blur-md animate-pulse" />
      {/* anillo dorado girando */}
      <span aria-hidden className="absolute inset-0 rounded-full border-2 border-gold/15 border-t-gold animate-spin" />
      {/* isotipo de la marca (estático, centrado) */}
      <img
        src="/icon-512.png" alt="" aria-hidden width={512} height={512}
        className="relative h-[58%] w-[58%] object-contain drop-shadow"
      />
    </span>
  );
}

/** Loader de marca centrado a pantalla completa, para estados de carga de sesión/ruta. */
export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 bg-ink text-cream/60">
      <BrandSpinner size="lg" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

/** Loader de marca centrado dentro de un contenedor/sección. */
export function LoadingBlock({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 text-cream/50 ${className}`}>
      <BrandSpinner size="md" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
