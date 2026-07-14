import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminSeller } from '../../lib/adminApi';

const SKELETON_KEYS = ['sk-a', 'sk-b', 'sk-c'];

function waUrl(phone: string, name: string) {
  const digits = phone.replace(/\D/g, '');
  const msg = encodeURIComponent(`Hola ${name}, te contacto desde Tangos y Milongas Tickets.`);
  return `https://wa.me/${digits}?text=${msg}`;
}

function WaButton({ phone, name }: Readonly<{ phone: string; name: string }>) {
  return (
    <a
      href={waUrl(phone, name)}
      target="_blank"
      rel="noopener noreferrer"
      title={`WhatsApp a ${name}`}
      className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366]/15 border border-[#25D366]/30 px-2.5 py-1 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25 transition-colors whitespace-nowrap"
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current shrink-0" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      WhatsApp
    </a>
  );
}

function SummaryCard({ label, value, hint, highlight }: Readonly<{ label: string; value: string; hint?: string; highlight?: boolean }>) {
  return (
    <div className={`rounded-lg border p-3 md:p-5 ${highlight ? 'border-gold/40 bg-gold/5' : 'border-gold/10 bg-ink-soft/60'}`}>
      <p className="text-[10px] uppercase tracking-widest text-gold-soft">{label}</p>
      <p className={`mt-1 font-display text-2xl md:text-3xl ${highlight ? 'text-gold' : 'text-cream'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-cream/50 hidden md:block">{hint}</p>}
    </div>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function SellerCard({ s }: Readonly<{ s: AdminSeller }>) {
  const pending = s.commission_pending_payment_ars ?? 0;
  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/40 hover:bg-ink-soft/60 transition overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/admin/sellers/${s.id}`} className="text-cream hover:text-gold font-medium text-sm">
            {s.name}
          </Link>
          <p className="text-xs text-cream/40 truncate mt-0.5">{s.contact_email ?? '—'}</p>
        </div>
        <span className={`text-xs shrink-0 mt-0.5 ${s.is_active ? 'text-gold' : 'text-cream/40'}`}>
          {s.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      <div className="px-4 pb-3 space-y-1.5">
        <div className="flex items-center gap-3 text-[10px] text-cream/50">
          <span className="font-mono text-gold-soft">{s.code}</span>
          <span>·</span>
          <span>Com. {Number(s.commission_percent).toFixed(1)}%</span>
          {s.orders_paid != null && (
            <>
              <span>·</span>
              <span>{s.orders_paid} ventas</span>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[10px] text-cream/50 flex-wrap">
            {(s.revenue_paid_ars ?? 0) > 0 && (
              <span>Rev. <span className="text-cream/70">ARS {(s.revenue_paid_ars ?? 0).toLocaleString()}</span></span>
            )}
            <span>
              Pendiente:{' '}
              <span className={pending > 0 ? 'text-gold font-mono' : 'text-cream/30'}>
                {pending > 0 ? `ARS ${pending.toLocaleString()}` : '—'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {s.contact_phone && <WaButton phone={s.contact_phone} name={s.name.split(' ')[0]} />}
            <Link to={`/admin/sellers/${s.id}`} className="text-xs text-gold-soft hover:text-gold transition shrink-0">
              Gestionar →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SellersList() {
  const [sellers, setSellers] = useState<AdminSeller[] | null>(null);
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.sellers.list()
      .then(setSellers)
      .catch((err) => setError((err as Error).message));
  }, []);

  const totals = useMemo(() => {
    if (!sellers) return null;
    return sellers.reduce(
      (acc, s) => {
        if (!s.is_active && !showInactive) return acc;
        acc.revenue += s.revenue_paid_ars ?? 0;
        acc.paid += s.commission_paid_ars ?? 0;
        acc.pending += s.commission_pending_payment_ars ?? 0;
        acc.netPending += s.net_pending_settlement_ars ?? 0;
        return acc;
      },
      { revenue: 0, paid: 0, pending: 0, netPending: 0 },
    );
  }, [sellers, showInactive]);

  const filtered = useMemo(() => {
    if (!sellers) return null;
    return sellers.filter((s) => {
      if (!showInactive && !s.is_active) return false;
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return s.name.toLowerCase().includes(q)
        || s.code.toLowerCase().includes(q)
        || (s.contact_email ?? '').toLowerCase().includes(q);
    });
  }, [sellers, filter, showInactive]);

  let mainContent: React.ReactNode;
  if (!filtered && !error) {
    mainContent = (
      <div className="space-y-3">
        {SKELETON_KEYS.map((k) => (
          <div key={k} className="h-[72px] rounded-xl bg-ink-soft/60 animate-pulse" />
        ))}
      </div>
    );
  } else if (filtered?.length === 0) {
    mainContent = (
      <p className="text-cream/60 text-sm">
        {sellers?.length === 0 ? 'No hay vendedores aún. Creá el primero.' : 'No hay resultados.'}
      </p>
    );
  } else if (filtered && filtered.length > 0) {
    mainContent = (
      <>
        {/* ── Mobile: cards ── */}
        <div className="md:hidden space-y-3">
          {filtered.map((s) => <SellerCard key={s.id} s={s} />)}
        </div>

        {/* ── Desktop: tabla ── */}
        <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-2.5 px-3">Vendedor</th>
                <th className="text-left py-2.5 px-3">Código</th>
                <th className="text-right py-2.5 px-3">Com.%</th>
                <th className="text-right py-2.5 px-3">Ventas</th>
                <th className="text-right py-2.5 px-3">Revenue</th>
                <th className="text-right py-2.5 px-3">Pendiente</th>
                <th className="text-center py-2.5 px-3">Estado</th>
                <th className="text-right py-2.5 px-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-gold/5 hover:bg-gold/5 transition">
                  <td className="py-2.5 px-3">
                    <Link to={`/admin/sellers/${s.id}`} className="text-cream hover:text-gold text-xs font-medium">{s.name}</Link>
                    <p className="text-xs text-cream/40 truncate max-w-[130px]">{s.contact_email ?? '—'}</p>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-gold-soft whitespace-nowrap">{s.code}</td>
                  <td className="py-2.5 px-3 text-right text-cream/80 tabular-nums text-xs">{Number(s.commission_percent).toFixed(1)}%</td>
                  <td className="py-2.5 px-3 text-right text-cream/70 tabular-nums text-xs">{s.orders_paid ?? 0}</td>
                  <td className="py-2.5 px-3 text-right text-cream/70 tabular-nums text-xs whitespace-nowrap">ARS {(s.revenue_paid_ars ?? 0).toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right text-gold tabular-nums text-xs whitespace-nowrap">
                    {(s.commission_pending_payment_ars ?? 0) > 0
                      ? `ARS ${(s.commission_pending_payment_ars ?? 0).toLocaleString()}`
                      : <span className="text-cream/40">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {s.is_active
                      ? <span className="text-xs text-gold">Activo</span>
                      : <span className="text-xs text-cream/40">Inactivo</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {s.contact_phone && <WaButton phone={s.contact_phone} name={s.name.split(' ')[0]} />}
                      <Link to={`/admin/sellers/${s.id}`} className="text-gold-soft hover:text-gold text-xs whitespace-nowrap">Gestionar →</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-cream/30 text-right">
          {filtered.length} vendedor{filtered.length === 1 ? '' : 'es'}
        </p>
      </>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4 md:mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Comisiones</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Vendedores</h1>
        </div>
        <Link to="/admin/sellers/new" className="btn-primary text-sm">+ Nuevo</Link>
      </header>

      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 md:mb-8">
          <SummaryCard label="Revenue generado" value={`ARS ${totals.revenue.toLocaleString()}`} hint="Ventas pagadas por Mercado Pago" />
          <SummaryCard label="Comisiones" value={`ARS ${totals.paid.toLocaleString()}`} hint="Comisiones de ventas por Mercado Pago" />
          <SummaryCard label="A pagar (MP)" value={`ARS ${totals.pending.toLocaleString()}`} hint="Comisiones de MP a liquidar a vendedores" highlight />
          <SummaryCard label="A cobrar (efectivo)" value={`ARS ${totals.netPending.toLocaleString()}`} hint="Neto que los vendedores nos deben rendir" />
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          type="search" placeholder="Buscar por nombre, código o email..."
          value={filter} onChange={(e) => setFilter(e.target.value)}
          className="input max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-cream/70">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-gold"
          />
          {'Mostrar inactivos'}
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {mainContent}
    </div>
  );
}
