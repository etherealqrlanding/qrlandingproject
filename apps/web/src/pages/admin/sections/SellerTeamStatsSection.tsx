import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSeller, type AdminSellerMember, type AdminSellerPeriodStats } from '../../../lib/adminApi';
import SimpleSelect from '../../../components/SimpleSelect';
import StatCard from '../../../components/seller/StatCard';

interface Props {
  seller: AdminSeller;
  selection: 'account' | number;
  onSelectionChange: (v: 'account' | number) => void;
}

function fmt(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

type Period = 'all' | 'today' | 'week' | 'month';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Mismo cálculo de rango que apps/web/src/components/seller/SellerTeamStats.tsx (ver
// ese archivo para el criterio de fechas locales sin conversión de huso horario).
function periodRange(period: Period): { from?: string; to?: string } {
  if (period === 'all') return {};
  const now = new Date();
  if (period === 'today') { const iso = toIso(now); return { from: iso, to: iso }; }
  if (period === 'week') {
    const dow = (now.getDay() + 6) % 7; // Lunes = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow);
    return { from: toIso(monday), to: toIso(now) };
  }
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toIso(startOfMonth), to: toIso(now) };
}

// Espejo admin de SellerTeamStats.tsx (portal del vendedor) — mismas tarjetas y
// mismos presets de período, pero sin ningún gate de PIN: el admin de la
// plataforma ya está autenticado y autorizado a ver cualquier cuenta, así que acá
// alcanza con el :id de la URL. Ver ese componente para el criterio de diseño.
export default function SellerTeamStatsSection({ seller, selection, onSelectionChange }: Readonly<Props>) {
  const [members, setMembers] = useState<AdminSellerMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [stats, setStats] = useState<AdminSellerPeriodStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  // La comisión ya no se edita por vendedor -- sale de la base por perfil que
  // configura el admin en Settings (ver SellersList.tsx para el mismo patrón).
  const [kindBaseCommissions, setKindBaseCommissions] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    adminApi.sellers.members(seller.id)
      .then(setMembers)
      .catch((err) => setMembersError((err as AdminApiError).message));
  }, [seller.id]);

  useEffect(() => {
    adminApi.settings.getSellerKindCommission().then(setKindBaseCommissions).catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingStats(true);
    setStatsError(null);
    const { from, to } = periodRange(period);
    adminApi.sellers.stats(seller.id, { memberId: selection === 'account' ? undefined : selection, from, to })
      .then(setStats)
      .catch((err) => setStatsError((err as AdminApiError).message))
      .finally(() => setLoadingStats(false));
  }, [seller.id, selection, period]);

  if (!seller.team_enabled) {
    return (
      <p className="text-sm text-cream/40">
        "Mi equipo" está deshabilitado para esta cuenta — no hay estadísticas por sub-recomendador para mostrar.
      </p>
    );
  }

  if (membersError) return <p className="text-sm text-bordeaux-light">{membersError}</p>;

  if (members == null) {
    return (
      <div className="space-y-2">
        {['a', 'b'].map((k) => <div key={k} className="h-14 rounded-lg bg-ink-soft/40 animate-pulse" />)}
      </div>
    );
  }

  const baseCommission = kindBaseCommissions?.[seller.kind ?? 'sin_especificar'] ?? 10;
  const commissionRate = `${baseCommission.toFixed(1)}%`;
  const selectedMember = typeof selection === 'number' ? members.find((m) => m.id === selection) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {members.length > 0 && (
          <div className="w-full sm:w-40">
            <SimpleSelect
              size="sm"
              value={selection === 'account' ? 'account' : String(selection)}
              onChange={(v) => onSelectionChange(v === 'account' ? 'account' : Number(v))}
              options={[
                { value: 'account', label: 'Toda la cuenta' },
                ...members.map((m) => ({ value: String(m.id), label: m.is_active ? m.name : `${m.name} (inactivo)` })),
              ]}
            />
          </div>
        )}

        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                period === p.value ? 'border-gold bg-gold/15 text-gold' : 'border-cream/15 text-cream/50 hover:border-cream/30'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {members.length === 0 && (
        <p className="text-sm text-cream/40">Todavía no cargó a nadie en su equipo.</p>
      )}

      {/* Skeleton solo en la primera carga — en las siguientes (cambio de selección o
          período) dejamos el grid anterior montado y solo lo atenuamos, para no
          reemplazarlo por un contenedor de otro alto y generar un salto visual. */}
      {stats == null && loadingStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {['a', 'b', 'c'].map((k) => <div key={k} className="h-20 rounded-xl bg-ink-soft/40 animate-pulse" />)}
        </div>
      )}

      {statsError && <p className="text-sm text-bordeaux-light">{statsError}</p>}

      {stats && (
        <section className={`grid grid-cols-2 sm:grid-cols-3 gap-3 transition-opacity ${loadingStats ? 'opacity-50' : ''}`}>
          <StatCard label="Ventas" value={String(stats.orders_paid)} sub="órdenes cobradas" />
          <StatCard label="Facturación" value={fmt(stats.revenue_paid_ars)} sub="ventas por tarjeta" />
          <StatCard
            label="Incentivo ganado"
            value={fmt(stats.commission_earned_ars)}
            sub={`${commissionRate} de ${selectedMember ? 'sus' : 'las'} ventas`}
          />
          <StatCard label="Ya cobrado" value={fmt(stats.commission_paid_ars)} sub="liquidado a la cuenta" />
          <StatCard label="Pendiente (Tarjeta)" value={fmt(stats.commission_pending_ars)} sub={stats.commission_pending_ars > 0 ? 'a cobrar del operador' : 'al día'} />
          <StatCard label="Neto a rendir" value={fmt(stats.net_pending_settlement_ars)} sub={stats.net_pending_settlement_ars > 0 ? 'de ventas en efectivo' : 'al día'} />
        </section>
      )}
    </div>
  );
}
