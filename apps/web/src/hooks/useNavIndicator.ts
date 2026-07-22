import { useEffect, useState, type RefObject } from 'react';

interface IndicatorRect {
  top: number;
  height: number;
}

// Mide la posición del link activo (NavLink pone aria-current="page" solo) para
// mover una "pill" absoluta detrás de los ítems del menú en vez de que el
// resaltado cambie de golpe. Se recalcula cuando cambian las deps (ruta,
// colapsado, etc.) — no depende de conocer el índice del ítem activo.
export function useNavIndicator(
  containerRef: RefObject<HTMLElement>,
  deps: readonly unknown[],
): IndicatorRect | null {
  const [rect, setRect] = useState<IndicatorRect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      setRect(null);
      return;
    }
    setRect({ top: active.offsetTop, height: active.offsetHeight });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return rect;
}
