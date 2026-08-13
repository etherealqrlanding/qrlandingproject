import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

// Transición sutil de apertura para bloques que se montan condicionalmente
// (ej. {isOpen && <Collapse>...}). Arranca "cerrado" y pasa a "abierto" un
// frame después de montarse, para que el propio CSS anime la transición
// (grid-template-rows 0fr → 1fr, sin medir alturas con JS). Solo toca
// grid-template-rows/opacity — nunca transform — para no interferir con el
// scroll de modales fixed que puedan abrirse más adelante en la página
// (ver project_modal_transform_fixed_bug en memoria).
export default function Collapse({ children, className = '' }: Readonly<Props>) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOpen(true);
      return;
    }
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
    >
      <div className={`overflow-hidden min-h-0 ${className}`}>{children}</div>
    </div>
  );
}
