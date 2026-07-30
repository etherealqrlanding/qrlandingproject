import { useEffect, useMemo, useState } from 'react';
import { adminApi, AdminApiError, type AdminProductSummary, type AdminProductRangeAvailabilityRow } from '../../../lib/adminApi';
import DayCapacityModal from './DayCapacityModal';

const MONTHS_VISIBLE = 3; // vista "hacia adelante" real (~90 días) sin sobre-pedir datos
const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

type DayStatus = 'open' | 'low' | 'full' | 'closed';

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 1=Lunes..7=Domingo — igual mapeo que usa el endpoint público de disponibilidad.
function isoDow(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getDay() || 7;
}

export default function ProductCapacityCalendar() {
  const today = useMemo(() => iso(new Date()), []);
  const [products, setProducts] = useState<AdminProductSummary[] | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [baseMonth, setBaseMonth] = useState(() => startOfMonth(new Date()));
  const [rows, setRows] = useState<AdminProductRangeAvailabilityRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  useEffect(() => {
    adminApi.products.list()
      .then((list) => {
        const active = list.filter((p) => p.is_active);
        setProducts(active);
        setProductId((prev) => prev ?? active[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : (err as Error).message));
  }, []);

  const rangeFrom = useMemo(() => iso(baseMonth), [baseMonth]);
  const rangeTo = useMemo(() => {
    const end = addMonths(baseMonth, MONTHS_VISIBLE);
    end.setDate(end.getDate() - 1);
    return iso(end);
  }, [baseMonth]);

  const load = () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    adminApi.products.availabilityRange(productId, rangeFrom, rangeTo)
      .then(setRows)
      .catch((err) => setError(err instanceof AdminApiError ? err.message : (err as Error).message))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [productId, rangeFrom, rangeTo]);

  const byDate = useMemo(() => {
    const m = new Map<string, AdminProductRangeAvailabilityRow[]>();
    for (const r of rows ?? []) {
      const list = m.get(r.date) ?? [];
      list.push(r);
      m.set(r.date, list);
    }
    return m;
  }, [rows]);

  const statusForDate = (date: string): DayStatus => {
    const tiers = byDate.get(date) ?? [];
    if (tiers.length === 0) return 'closed';
    const dow = isoDow(date);
    const operating = tiers.filter((t) =>
      t.available_days.includes(dow) && t.product_available_days.includes(dow) && !t.is_closed,
    );
    if (operating.length === 0) return 'closed';
    if (operating.every((t) => t.capacity <= 0 || t.remaining <= 0)) return 'full';
    if (operating.some((t) => t.remaining <= t.low_availability_threshold)) return 'low';
    return 'open';
  };

  const canPrev = baseMonth > startOfMonth(new Date());
  const months = useMemo(
    () => Array.from({ length: MONTHS_VISIBLE }, (_, i) => addMonths(baseMonth, i)),
    [baseMonth],
  );

  const selectedProductName = products?.find((p) => p.id === productId)?.name ?? '';

  return (
    <section>
      <h2 className="font-display text-2xl text-cream mb-1">Calendario por casa</h2>
      <p className="text-sm text-cream/50 mb-5">
        Elegí una casa y mirá varios meses hacia adelante de un vistazo — cada día se colorea
        según su cupo agregado entre los tiers activos. Click en un día para editar su cupo
        sin salir del calendario.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={productId ?? ''}
          onChange={(e) => setProductId(Number(e.target.value))}
          className="input w-auto"
          aria-label="Casa de tango"
        >
          {(products ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button" disabled={!canPrev} onClick={() => setBaseMonth(addMonths(baseMonth, -1))}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-gold/15 transition text-cream/60 disabled:opacity-25 text-lg"
          >‹</button>
          <button
            type="button" onClick={() => setBaseMonth(addMonths(baseMonth, 1))}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-gold/15 transition text-cream/60 text-lg"
          >›</button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {products && products.length === 0 && (
        <p className="text-cream/50 text-sm">No hay casas activas.</p>
      )}

      {loading && (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-80 rounded-lg bg-ink-soft/60 animate-pulse" />)}
        </div>
      )}

      {!loading && products && products.length > 0 && (
        <div className="grid md:grid-cols-3 gap-4">
          {months.map((m) => (
            <MonthGrid
              key={iso(m)}
              monthDate={m}
              today={today}
              statusForDate={statusForDate}
              onDayClick={(d) => setOpenDay(d)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-cream/40">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gold/15 border border-gold/20 inline-block" />Abierto</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gold/10 border border-gold/30 inline-block" /><span className="w-1.5 h-1.5 -ml-4 rounded-full bg-amber-400 inline-block" />Cupo bajo</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-bordeaux-deep/20 border border-bordeaux-light/30 inline-block" />Sin cupo</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink/40 border border-bordeaux-light/20 inline-block" />Cerrado</span>
      </div>

      {openDay && productId && (
        <DayCapacityModal
          date={openDay}
          productId={productId}
          productName={selectedProductName}
          onClose={() => setOpenDay(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}

function MonthGrid({ monthDate, today, statusForDate, onDayClick }: Readonly<{
  monthDate: Date;
  today: string;
  statusForDate: (date: string) => DayStatus;
  onDayClick: (date: string) => void;
}>) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const firstDow = (startOfMonth(monthDate).getDay() + 6) % 7; // Lu=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const cells: Array<string | null> = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`),
  ];
  const rawLabel = monthDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  return (
    <div className="rounded-lg border border-gold/15 bg-ink-soft/50 p-4">
      <p className="text-sm font-medium text-cream/90 mb-2 text-center">{monthLabel}</p>
      <div className="grid grid-cols-7 mb-0.5">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-cream/30 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const isPast = day < today;
          const status = statusForDate(day);
          const dayNum = Number(day.slice(-2));

          let cls = 'relative flex items-center justify-center h-9 rounded text-xs font-normal transition ';
          if (isPast) {
            cls += 'text-cream/20 cursor-default';
          } else if (status === 'closed') {
            cls += 'bg-ink/40 border border-bordeaux-light/20 text-cream/25 hover:bg-ink/60 cursor-pointer';
          } else if (status === 'full') {
            cls += 'bg-bordeaux-deep/20 border border-bordeaux-light/30 text-bordeaux-light hover:bg-bordeaux-deep/30 cursor-pointer';
          } else if (status === 'low') {
            cls += 'bg-gold/10 border border-gold/30 text-gold-soft hover:bg-gold/20 cursor-pointer';
          } else {
            cls += 'border border-gold/10 text-cream/75 hover:bg-gold/10 cursor-pointer';
          }

          return (
            <button
              key={day} type="button" disabled={isPast}
              onClick={() => onDayClick(day)}
              className={cls}
            >
              {dayNum}
              {status === 'low' && !isPast && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
