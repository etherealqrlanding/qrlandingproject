import { useEffect, useRef, useState } from 'react';

/**
 * Recuerda el último registro que se abrió desde un listado (guardado en
 * sessionStorage justo antes de navegar al detalle) y, al volver, restaura el
 * scroll a esa fila/card y la resalta un instante. Se consume una sola vez.
 *
 * `items` debe ser el estado crudo recién cargado (no una lista derivada con
 * useMemo/filter), para que el efecto dispare solo cuando cambian los datos
 * reales y no en cada render. App.tsx resetea el scroll a top en cada cambio
 * de ruta, así que sin esto se pierde la posición por completo al volver.
 */
export function useReturnHighlight<T>(
  storageKey: string,
  items: T[] | null,
  getId: (item: T) => string | number,
) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // Guardamos el nodo en un ref "de mano" (no un RefObject tipado a un elemento
  // puntual) y exponemos un ref-callback: así sirve tanto para <div> (mobile)
  // como <tr> (desktop) sin pelear con la invariancia de tipos de RefObject.
  const nodeRef = useRef<HTMLElement | null>(null);
  const highlightedRef = (node: HTMLElement | null) => { nodeRef.current = node; };

  useEffect(() => {
    if (!items) return;
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    sessionStorage.removeItem(storageKey);
    if (!items.some((item) => String(getId(item)) === stored)) return;
    setHighlightedId(stored);
    const raf = requestAnimationFrame(() => {
      nodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timeout = setTimeout(() => setHighlightedId(null), 2200);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, storageKey]);

  return {
    isHighlighted: (id: string | number) => String(id) === highlightedId,
    highlightedRef,
    markVisited: (id: string | number) => sessionStorage.setItem(storageKey, String(id)),
  };
}
