type LogoProps = {
  /** 'light' = texto crema (para fondo oscuro). 'color' = original azul/rojo (para fondo claro). */
  variant?: 'light' | 'color';
  /** Clases de tamaño/posición (ej. "h-12 w-auto"). */
  className?: string;
};

/**
 * Logo de marca Tangos & Milongas Tickets.
 * Usa la versión clara sobre fondos oscuros (default) y la a color sobre claros.
 */
export default function Logo({ variant = 'light', className = 'h-12 w-auto' }: LogoProps) {
  const src = variant === 'light' ? '/logo-light.png' : '/logo.png';
  return (
    <img
      src={src}
      alt="Tango QR"
      className={className}
      width={1324}
      height={614}
    />
  );
}
