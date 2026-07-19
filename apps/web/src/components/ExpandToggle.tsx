// Ícono de expandir/contraer, chevron que rota — mismo gesto en Órdenes, Ventas y
// comisiones, y el Archivo del admin.
export default function ExpandToggle({ open, onClick }: Readonly<{ open: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={open ? 'Ocultar detalle' : 'Ver detalle'}
      aria-expanded={open}
      className="text-gold-soft hover:text-gold text-xs shrink-0 inline-flex items-center gap-1"
    >
      <span className={`inline-block transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
    </button>
  );
}
