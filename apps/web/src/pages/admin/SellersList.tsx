import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminSeller } from '../../lib/adminApi';

const SKELETON_KEYS = ['sk-a', 'sk-b', 'sk-c'];

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
  const pending = s.commission_pending_payment_usd ?? 0;
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
            {(s.revenue_paid_usd ?? 0) > 0 && (
              <span>Rev. <span className="text-cream/70">USD {(s.revenue_paid_usd ?? 0).toLocaleString()}</span></span>
            )}
            <span>
              Pendiente:{' '}
              <span className={pending > 0 ? 'text-gold font-mono' : 'text-cream/30'}>
                {pending > 0 ? `USD ${pending.toLocaleString()}` : '—'}
              </span>
            </span>
          </div>
          <Link to={`/admin/sellers/${s.id}`} className="text-xs text-gold-soft hover:text-gold transition shrink-0">
            Gestionar →
          </Link>
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
        acc.revenue += s.revenue_paid_usd ?? 0;
        acc.paid += s.commission_paid_usd ?? 0;
        acc.pending += s.commission_pending_payment_usd ?? 0;
        return acc;
      },
      { revenue: 0, paid: 0, pending: 0 },
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
                  <td className="py-2.5 px-3 text-right text-cream/70 tabular-nums text-xs whitespace-nowrap">USD {(s.revenue_paid_usd ?? 0).toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right text-gold tabular-nums text-xs whitespace-nowrap">
                    {(s.commission_pending_payment_usd ?? 0) > 0
                      ? `USD ${(s.commission_pending_payment_usd ?? 0).toLocaleString()}`
                      : <span className="text-cream/40">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {s.is_active
                      ? <span className="text-xs text-gold">Activo</span>
                      : <span className="text-xs text-cream/40">Inactivo</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Link to={`/admin/sellers/${s.id}`} className="text-gold-soft hover:text-gold text-xs whitespace-nowrap">Gestionar →</Link>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 md:mb-8">
          <SummaryCard label="Revenue generado" value={`USD ${totals.revenue.toLocaleString()}`} hint="Total ventas pagadas atribuidas" />
          <SummaryCard label="Comisiones" value={`USD ${totals.paid.toLocaleString()}`} hint="Acumulado de todas las ventas pagadas" />
          <SummaryCard label="Pendiente de pago" value={`USD ${totals.pending.toLocaleString()}`} hint="A pagar a vendedores" highlight />
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
