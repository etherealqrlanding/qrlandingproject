import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminSeller } from '../../lib/adminApi';

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
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.contact_email ?? '').toLowerCase().includes(q);
    });
  }, [sellers, filter, showInactive]);

  return (
    <div className="p-8 max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Comisiones</p>
          <h1 className="mt-2 font-display text-4xl text-cream">Vendedores</h1>
        </div>
        <Link to="/admin/sellers/new" className="btn-primary">+ Nuevo vendedor</Link>
      </header>

      {totals && (
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Card label="Revenue generado" value={`USD ${totals.revenue.toLocaleString()}`} hint="Total ventas pagadas atribuidas" />
          <Card label="Comisiones totales" value={`USD ${totals.paid.toLocaleString()}`} hint="Acumulado de todas las ventas pagadas" />
          <Card label="Pendiente de pago" value={`USD ${totals.pending.toLocaleString()}`} hint="A pagar a vendedores" highlight />
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center mb-6">
        <input
          type="search" placeholder="Buscar por nombre, código o email..."
          value={filter} onChange={(e) => setFilter(e.target.value)}
          className="input max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-cream/70">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-gold" />
          Mostrar inactivos
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {!filtered && !error && (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded bg-ink-soft/60 animate-pulse" />)}</div>
      )}

      {filtered && filtered.length === 0 && (
        <div className="text-cream/60 text-sm">
          {sellers && sellers.length === 0 ? 'No hay vendedores aún. Creá el primero.' : 'No hay resultados.'}
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-3 px-4">Vendedor</th>
                <th className="text-left py-3 px-4">Código (QR)</th>
                <th className="text-right py-3 px-4">Comisión</th>
                <th className="text-right py-3 px-4">Ventas pagadas</th>
                <th className="text-right py-3 px-4">Revenue</th>
                <th className="text-right py-3 px-4">Pendiente pago</th>
                <th className="text-center py-3 px-4">Estado</th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-gold/5 hover:bg-gold/5 transition">
                  <td className="py-3 px-4">
                    <Link to={`/admin/sellers/${s.id}`} className="text-cream hover:text-gold font-medium">{s.name}</Link>
                    <p className="text-xs text-cream/40">{s.contact_email ?? '—'}{s.kind ? ` · ${s.kind}` : ''}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-gold-soft">{s.code}</td>
                  <td className="py-3 px-4 text-right text-cream/80 tabular-nums">{Number(s.commission_percent).toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right text-cream/70 tabular-nums">{s.orders_paid ?? 0}</td>
                  <td className="py-3 px-4 text-right text-cream/70 tabular-nums">USD {(s.revenue_paid_usd ?? 0).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-gold tabular-nums">
                    {(s.commission_pending_payment_usd ?? 0) > 0
                      ? `USD ${(s.commission_pending_payment_usd ?? 0).toLocaleString()}`
                      : <span className="text-cream/40">—</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {s.is_active ? <span className="text-xs text-gold">Activo</span> : <span className="text-xs text-cream/40">Inactivo</span>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/admin/sellers/${s.id}`} className="text-gold-soft hover:text-gold text-sm">Gestionar →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-5 ${highlight ? 'border-gold/40 bg-gold/5' : 'border-gold/10 bg-ink-soft/60'}`}>
      <p className="text-xs uppercase tracking-widest text-gold-soft">{label}</p>
      <p className={`mt-2 font-display text-3xl ${highlight ? 'text-gold' : 'text-cream'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-cream/50">{hint}</p>}
    </div>
  );
}
