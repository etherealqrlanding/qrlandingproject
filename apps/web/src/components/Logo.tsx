type LogoProps = {
  /** 'light' = texto crema (para fondo oscuro). 'color' = original azul/rojo (para fondo claro). */
  variant?: 'light' | 'color';
  /** Clases de tamaño/posición (ej. "h-12 w-auto"). */
  className?: string;
  /** false = versión sin el lema "El mejor tango de Buenos Aires" (ej. hero, donde ya hay lugar de sobra para texto propio). */
  tagline?: boolean;
};

const SIZES = {
  withTagline: { light: '/logo-light.png', color: '/logo.png', width: 2665 },
  noTagline: { light: '/logo-light-notagline.png', color: '/logo-notagline.png', width: 1520 },
};

/**
 * Logo de marca Tango QR.
 * Usa la versión clara sobre fondos oscuros (default) y la a color sobre claros.
 */
export default function Logo({ variant = 'light', className = 'h-12 w-auto', tagline = true }: LogoProps) {
  const set = tagline ? SIZES.withTagline : SIZES.noTagline;
  const src = variant === 'light' ? set.light : set.color;
  return (
    <img
      src={src}
      alt="Tango QR"
      className={`animate-logo-fade ${className}`}
      width={set.width}
      height={614}
    />
  );
}
