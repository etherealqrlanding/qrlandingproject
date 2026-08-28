import { useEffect, useState } from 'react';
import { sellerApi, SellerApiError, type SellerMember, type SellerPeriodStats } from '../../lib/sellerApi';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import SimpleSelect from '../SimpleSelect';
import StatCard from './StatCard';
import TeamStatsGate from './TeamStatsGate';

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

// Rango [from, to] en fechas locales del dispositivo (YYYY-MM-DD) — mismo criterio
// simple que ya usa DateRangePicker.tsx en el resto de la app, sin conversión
// explícita de huso horario.
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

type Unlock = { type: 'admin' } | { type: 'member'; memberId: number } | null;

// Estadísticas por sub-vendedor dentro de "Mi equipo" — mismo set de tarjetas que el
// dashboard de cuenta (SellerDashboard), filtrable por período y recortable a una
// persona puntual. En equipos con PIN, ver el desglose de alguien más allá de uno
// mismo exige desbloquear con el PIN propio de esa persona (solo sirve para ella) o
// con el PIN de administrador (sirve para navegar libre entre todos). "Toda la
// cuenta" nunca pide nada — es lo mismo que ya se ve en Resumen, solo que acá se
// puede además recortar por período.
export default function SellerTeamStats() {
  const { me } = useSellerAuth();
  const pinRequired = me?.team_pin_required ?? true;
  const [members, setMembers] = useState<SellerMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [selection, setSelection] = useState<'account' | number>('account');
  const [period, setPeriod] = useState<Period>('all');
  const [unlockedAs, setUnlockedAs] = useState<Unlock>(null);
  const [stats, setStats] = useState<SellerPeriodStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    sellerApi.members.list()
      .then(setMembers)
      .catch((err) => setMembersError((err as SellerApiError).message));
  }, []);

  const isUnlockedFor = (memberId: number) =>
    !pinRequired || unlockedAs?.type === 'admin' || (unlockedAs?.type === 'member' && unlockedAs.memberId === memberId);

  const canFetch = selection === 'account' || isUnlockedFor(selection);

  useEffect(() => {
    if (!canFetch) { setStats(null); setStatsError(null); return; }
    setLoadingStats(true);
    setStatsError(null);
    const { from, to } = periodRange(period);
    sellerApi.stats({ memberId: selection === 'account' ? undefined : selection, from, to })
      .then(setStats)
      .catch((err) => setStatsError((err as SellerApiError).message))
      .finally(() => setLoadingStats(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, period, canFetch]);

  if (!me) return null;

  if (membersError) return <p className="text-sm text-bordeaux-light">{membersError}</p>;

  if (members == null) {
    return (
      <div className="space-y-2">
        {['a', 'b'].map((k) => <div key={k} className="h-14 rounded-lg bg-ink-soft/40 animate-pulse" />)}
      </div>
    );
  }

  const selectedMember = typeof selection === 'number' ? members.find((m) => m.id === selection) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {members.length > 0 && (
          <div className="w-full sm:w-40">
            <SimpleSelect
              size="sm"
              value={selection === 'account' ? 'account' : String(selection)}
              onChange={(v) => setSelection(v === 'account' ? 'account' : Number(v))}
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
        <p className="text-sm text-cream/40">
          Todavía no cargaste a nadie de tu equipo — hacelo desde la pestaña "Equipo" para poder ver estadísticas por persona.
        </p>
      )}

      {selectedMember && !isUnlockedFor(selectedMember.id) && (
        <TeamStatsGate
          member={selectedMember}
          onUnlockedAsMember={() => setUnlockedAs({ type: 'member', memberId: selectedMember.id })}
          onUnlockedAsAdmin={() => setUnlockedAs({ type: 'admin' })}
        />
      )}

      {canFetch && (
        <>
          {selectedMember && unlockedAs && (
            <div className="flex items-center justify-between text-xs text-cream/40">
              <span>
                {unlockedAs.type === 'admin' ? '✓ Viendo como administrador' : `✓ Viendo como ${selectedMember.name}`}
              </span>
              <button type="button" onClick={() => setUnlockedAs(null)} className="text-gold-soft hover:text-gold transition underline underline-offset-2">
                cambiar
              </button>
            </div>
          )}

          {/* Skeleton solo en la primera carga — en las siguientes (cambio de
              selección o período) dejamos el grid anterior montado y solo lo
              atenuamos, para no reemplazarlo por un contenedor de otro alto y
              generar un salto visual. */}
          {stats == null && loadingStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {['a', 'b', 'c'].map((k) => <div key={k} className="h-20 rounded-xl bg-ink-soft/40 animate-pulse" />)}
            </div>
          )}

          {statsError && <p className="text-sm text-bordeaux-light">{statsError}</p>}

          {stats && (
            <section className={`grid grid-cols-2 sm:grid-cols-3 gap-3 transition-opacity ${loadingStats ? 'opacity-50' : ''}`}>
              <StatCard label="Ventas" value={String(stats.orders_paid)} sub="órdenes cobradas" />
              <StatCard label="Facturación" value={fmt(stats.revenue_paid_ars)} sub="ventas por Mercado Pago" />
              <StatCard
                label="Incentivo ganado"
                value={fmt(stats.commission_earned_ars)}
                sub="según el perfil y cada servicio"
              />
              <StatCard label="Ya cobrado" value={fmt(stats.commission_paid_ars)} sub="liquidado a la cuenta" />
              <StatCard label="Pendiente (MP)" value={fmt(stats.commission_pending_ars)} sub={stats.commission_pending_ars > 0 ? 'a cobrar del operador' : 'al día'} />
              <StatCard label="Neto a rendir" value={fmt(stats.net_pending_settlement_ars)} sub={stats.net_pending_settlement_ars > 0 ? 'de ventas en efectivo' : 'al día'} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
