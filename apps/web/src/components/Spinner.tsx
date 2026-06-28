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

/** Spinner centrado a pantalla completa, para estados de carga de sesión/ruta. */
export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-ink text-cream/60">
      <Spinner size="lg" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

/** Spinner centrado dentro de un contenedor/sección. */
export function LoadingBlock({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-10 text-cream/50 ${className}`}>
      <Spinner size="md" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
