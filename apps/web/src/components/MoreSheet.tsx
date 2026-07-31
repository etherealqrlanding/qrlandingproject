interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Hoja deslizable desde abajo para el botón "Más" de los bottom nav de mobile
 * (cliente público y admin) — mismo chrome (backdrop, panel, header con cierre),
 * cada nav le pasa su propio contenido.
 */
export default function MoreSheet({ title, onClose, children }: Readonly<Props>) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="absolute bottom-0 inset-x-0 rounded-t-2xl border-t border-gold/20 bg-ink-soft animate-sheet-up"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-8 w-8 flex items-center justify-center rounded-full text-cream/50 hover:text-cream active:bg-gold/10"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
