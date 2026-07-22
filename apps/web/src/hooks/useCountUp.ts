import { useEffect, useRef, useState } from 'react';

/**
 * Anima un número desde su valor anterior hasta `target` (ease-out). La primera
 * vez que se monta anima desde 0 (para el efecto de "conteo" al cargar la
 * pantalla); los cambios posteriores animan desde el valor previo. Salta
 * directo al valor final si el usuario prefiere menos movimiento.
 */
export function useCountUp(target: number, duration = 700): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}
