import { useEffect, useRef, useState } from 'react';

interface Props extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  /** Retraso en ms, para escalonar varios Reveal seguidos (ej. tarjetas en fila). */
  delay?: number;
  /** Tag a renderizar (default 'div') — ej. 'section' para mantener el id de anclaje. */
  as?: 'div' | 'section';
  /** Variante más marcada (sube más + arranca levemente achicada) — para elementos
   * puntuales tipo tarjetas, donde el fade sutil por defecto pasa desapercibido. */
  pop?: boolean;
}

// Fade + leve subida cuando la sección entra en el viewport (una sola vez —
// no se re-oculta al scrollear hacia arriba). Importante: en el estado
// "visible" no queda ninguna clase de transform aplicada (solo opacity) —
// dejar un transform colgado (aunque sea translate-y-0) rompe el scroll de
// cualquier modal fixed que se abra más adelante en la página (ver
// project_modal_transform_fixed_bug en memoria).
export default function Reveal({ children, className = '', delay = 0, as = 'div', pop = false, ...rest }: Readonly<Props>) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as;
  const hiddenClasses = pop ? 'opacity-0 translate-y-8 scale-95' : 'opacity-0 translate-y-6';
  return (
    <Tag
      ref={ref as React.Ref<never>}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all ${pop ? 'duration-500' : 'duration-700'} ease-out ${visible ? 'opacity-100' : hiddenClasses} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
