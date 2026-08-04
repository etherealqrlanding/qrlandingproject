import { Link } from 'react-router-dom';
import { useSellerSettings, windowLabel } from '../../lib/useSellerSettings';
import { fmtArs } from '../../lib/useExchangeRate';

// Franja compacta con los datos que el vendedor necesita tener a mano al armar una
// reserva (tipo de cambio, ventanas de modificar/cancelar, horario límite). Va en el
// header de Catálogo y Nueva Reserva; el detalle completo con explicaciones vive en
// /seller/configuracion.
export default function SellerQuickSettings() {
  const { data } = useSellerSettings();

  if (!data) return null;

  const chips = [
    { icon: '💱', label: data.exchange_rate != null ? `${fmtArs(data.exchange_rate)} / USD` : '—' },
    { icon: '🕐', label: data.same_day_booking_cutoff ? `Reservas hasta las ${data.same_day_booking_cutoff}` : 'Sin horario límite' },
    { icon: '✎', label: `Modificar: ${windowLabel(data.modify_window_hours)}` },
    { icon: '✕', label: `Cancelar: ${windowLabel(data.cancel_window_hours)}` },
  ];

  return (
    <Link
      to="/seller/configuracion"
      className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-gold/15 bg-ink-soft/40 px-4 py-2.5 hover:border-gold/30 transition-colors"
      title="Ver configuración completa"
    >
      {chips.map((c) => (
        <span key={c.label} className="flex items-center gap-1.5 text-xs text-cream/70 whitespace-nowrap">
          <span aria-hidden>{c.icon}</span>
          {c.label}
        </span>
      ))}
    </Link>
  );
}
