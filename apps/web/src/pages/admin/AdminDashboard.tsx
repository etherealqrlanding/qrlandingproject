import { Link } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const MODULES = [
  {
    icon: '◈',
    label: 'Productos',
    href: '/admin/products',
    body: 'Cada producto es una casa de tango con opciones (tiers de precio y horario). Configurá capacidad diaria, precio neto y disponibilidad por fecha.',
  },
  {
    icon: '✦',
    label: 'Recomendadores',
    href: '/admin/sellers',
    body: 'Cada recomendador tiene un código QR único y un % de incentivo por recomendación. Pueden cobrar en efectivo o generar links de Mercado Pago. Desde el listado podés contactarlos directo por WhatsApp.',
  },
  {
    icon: '◆',
    label: 'Órdenes',
    href: '/admin/orders',
    body: 'Todas las reservas del sistema. Podés modificar pax, reintegrar por MP, cancelar, reprogramar fecha y ver el historial completo de eventos de cada orden.',
  },
  {
    icon: '⬡',
    label: 'Configuración',
    href: '/admin/settings',
    body: 'Tipo de cambio USD → ARS, ventana mínima de cancelación y modificación, y corte de disponibilidad para el mismo día. Afectan a toda la operación en tiempo real.',
  },
  {
    icon: '✎',
    label: 'Contenido',
    href: '/admin/content',
    body: 'Editá las secciones Nosotros y FAQ del sitio público (bilingüe), y las preguntas frecuentes del portal de recomendadores. Sin tocar código.',
  },
];

const TIPS = [
  {
    num: '01',
    title: 'Invitá a un recomendador en segundos',
    body: 'Creá el recomendador, guardalo y abrí el tab "Código QR". Desde ahí podés reenviar el link de invitación al portal o descargar el QR para compartirlo.',
  },
  {
    num: '02',
    title: 'Para reintegros por MP, usá el botón de la orden',
    body: 'El botón "Reintegrar" en el detalle de la orden llama directamente a la API de Mercado Pago con idempotency key — nunca se procesa dos veces aunque se haga doble clic.',
  },
  {
    num: '03',
    title: 'Actualizá el tipo de cambio frecuentemente',
    body: 'Los montos en pesos se calculan multiplicando el precio en USD por el tipo de cambio del momento de la compra. Mantenerlo al día asegura que los incentivos por recomendación y los montos sean precisos.',
  },
  {
    num: '04',
    title: 'La ventana de cancelación es global',
    body: 'Si configurás 48 hs, ni recomendadores ni el admin pueden cancelar dentro de ese plazo. Ajustala según la política del momento; en temporada alta puede convenir ajustarla.',
  },
  {
    num: '05',
    title: 'El historial de una orden no miente',
    body: 'Cada pago, modificación, cobro y cancelación queda registrado en los eventos de la orden. Ante cualquier disputa con un recomendador o pasajero, ese es el primer lugar donde mirar.',
  },
  {
    num: '06',
    title: 'Recomendador sin teléfono = sin botón de WhatsApp',
    body: 'El botón de WhatsApp solo aparece si el recomendador tiene teléfono cargado. Si no aparece, editá el recomendador y completá el campo "Teléfono de contacto".',
  },
];

function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

export default function AdminDashboard() {
  const { me } = useAdminAuth();
  if (!me) return null;

  const cards = [
    {
      label: 'Productos activos',
      value: String(me.stats.products),
      hint: 'Casas de tango publicadas',
      href: '/admin/products',
    },
    {
      label: 'Órdenes pagadas',
      value: String(me.stats.orders_paid),
      hint: 'Total histórico',
      href: '/admin/orders',
    },
    {
      label: 'Órdenes pendientes',
      value: String(me.stats.orders_pending),
      hint: 'Esperando confirmación de pago',
      href: '/admin/orders',
    },
    {
      label: 'Facturación Mercado Pago',
      value: fmtArs(me.stats.mp_revenue_ars),
      hint: 'Total histórico cobrado por MP',
      href: '/admin/orders',
    },
    {
      label: 'Neto pendiente',
      value: fmtArs(me.stats.net_pending_ars),
      hint: 'Efectivo que los recomendadores todavía tienen que rendir',
      href: '/admin/orders',
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl space-y-10 md:space-y-14">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">
          Bienvenido, {me.admin.full_name ?? me.admin.email}
        </p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Dashboard</h1>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.href}
            className="rounded-lg border border-gold/10 bg-ink-soft/60 p-4 md:p-6 transition hover:border-gold/30 block"
          >
            <p className="text-xs uppercase tracking-widest text-gold-soft leading-tight">{c.label}</p>
            <p className="font-display text-2xl md:text-4xl text-cream mt-2 md:mt-3">{c.value}</p>
            <p className="mt-1 text-xs text-cream/50">{c.hint}</p>
          </Link>
        ))}
      </section>

      {/* Acciones rápidas */}
      <section>
        <h2 className="font-display text-xl md:text-2xl text-cream mb-3 md:mb-4">Acciones rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/products/new" className="btn-primary">+ Nuevo producto</Link>
          <Link to="/admin/products" className="btn-ghost">Ver todos los productos</Link>
        </div>
      </section>

      {/* Módulos */}
      <section>
        <p className="text-xs uppercase tracking-widest text-gold-soft mb-5">Qué hace cada módulo</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULES.map((m) => (
            <Link
              key={m.label}
              to={m.href}
              className="rounded-xl border border-gold/10 bg-ink-soft/30 p-5 hover:border-gold/25 hover:bg-ink-soft/50 transition-colors"
            >
              <span className="text-gold text-lg mb-3 block">{m.icon}</span>
              <p className="text-cream font-medium text-sm mb-1.5">{m.label}</p>
              <p className="text-cream/50 text-xs leading-relaxed">{m.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Tips */}
      <section>
        <p className="text-xs uppercase tracking-widest text-gold-soft mb-5">Tips operativos</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {TIPS.map((t) => (
            <div key={t.num} className="flex gap-4 rounded-xl border border-gold/10 bg-ink-soft/20 p-4">
              <span className="shrink-0 font-mono text-xs text-gold/40 mt-0.5 w-5">{t.num}</span>
              <div>
                <p className="text-cream text-sm font-medium mb-1">{t.title}</p>
                <p className="text-cream/50 text-xs leading-relaxed">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
