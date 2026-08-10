import { useState } from 'react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';

interface Props {
  from: string; // YYYY-MM-DD, '' = sin límite
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromIso(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function fmtShort(iso: string) { return fromIso(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }

function preset(daysBack: number, daysBackEnd = 0) {
  const end = new Date(); end.setDate(end.getDate() - daysBackEnd);
  const start = new Date(); start.setDate(start.getDate() - daysBack);
  return { from: toIso(start), to: toIso(end) };
}
function thisMonth() {
  const now = new Date();
  return { from: toIso(startOfMonth(now)), to: toIso(now) };
}
function lastMonth() {
  const now = new Date();
  const start = addMonths(startOfMonth(now), -1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: toIso(start), to: toIso(end) };
}

const PRESETS: { label: string; get: () => { from: string; to: string } }[] = [
  { label: 'Hoy', get: () => preset(0) },
  { label: 'Ayer', get: () => preset(1, 1) },
  { label: 'Últimos 7 días', get: () => preset(6) },
  { label: 'Últimos 30 días', get: () => preset(29) },
  { label: 'Este mes', get: () => thisMonth() },
  { label: 'Mes pasado', get: () => lastMonth() },
];

/**
 * Selector de rango de fechas con calendario visual (en vez de dos <input
 * type="date"> nativos) — el admin arma el rango a ojo o con un preset,
 * mucho más rápido para el uso diario que tipear/scrollear fechas a mano.
 */
export default function DateRangePicker({ from, to, onChange, className }: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [hover, setHover] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(from ? fromIso(from) : new Date()));

  const label = !from && !to
    ? 'Rango de fechas'
    : from && to
      ? `${fmtShort(from)} – ${fmtShort(to)}`
      : from
        ? `Desde ${fmtShort(from)}`
        : `Hasta ${fmtShort(to)}`;

  function resetDraft() {
    setDraftFrom(from);
    setDraftTo(to);
    setViewMonth(startOfMonth(from ? fromIso(from) : new Date()));
  }

  function pickDay(iso: string) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(iso);
      setDraftTo('');
    } else if (iso < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(iso);
    } else {
      setDraftTo(iso);
    }
  }

  const { cells, monthLabel } = (() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const firstDow = (startOfMonth(viewMonth).getDay() + 6) % 7; // Lu=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cellsArr: Array<string | null> = [
      ...Array<null>(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`),
    ];
    const raw = new Date(y, m, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return { cells: cellsArr, monthLabel: raw.charAt(0).toUpperCase() + raw.slice(1) };
  })();

  const rangeEnd = draftTo || (draftFrom && hover && hover > draftFrom ? hover : null);
  const rangeStart = draftFrom;

  return (
    <Popover className={className}>
      {({ close }) => (
        <>
          <PopoverButton
            onClick={resetDraft}
            className={`input flex items-center justify-between gap-2 text-left text-sm ${(from || to) ? 'text-cream' : 'text-cream/40'}`}
          >
            <span className="truncate">{label}</span>
            <svg aria-hidden viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-gold/70">
              <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M3 8.5H17" stroke="currentColor" strokeWidth="1.4" />
              <path d="M6.5 3V5.5M13.5 3V5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </PopoverButton>

          <PopoverPanel
            transition
            anchor="bottom start"
            className="z-50 mt-2 w-[19rem] rounded-xl border border-gold/25 bg-ink-soft p-3 shadow-2xl shadow-black/50 transition duration-150 ease-out data-[closed]:opacity-0 data-[closed]:-translate-y-1"
          >
            <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-gold/10">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { const r = p.get(); onChange(r.from, r.to); close(); }}
                  className="px-2.5 py-1 rounded-full border border-gold/15 text-[11px] text-cream/60 hover:border-gold/40 hover:text-cream transition"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-gold/15 transition text-cream/60 text-lg">‹</button>
              <span className="text-sm font-medium text-cream/90">{monthLabel}</span>
              <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-gold/15 transition text-cream/60 text-lg">›</button>
            </div>

            <div className="grid grid-cols-7 mb-0.5">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-medium text-cream/30 py-0.5">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => setHover(null)}>
              {cells.map((iso, idx) => {
                if (!iso) return <div key={idx} />;
                const isStart = iso === rangeStart;
                const isEnd = iso === draftTo;
                const isPreviewEnd = !draftTo && iso === rangeEnd && iso !== rangeStart;
                const inRange = !!rangeStart && !!rangeEnd && iso > rangeStart && iso < rangeEnd;
                const isToday = iso === toIso(new Date());
                const dayNum = Number(iso.slice(-2));

                let cls = 'relative flex items-center justify-center h-8 text-xs font-normal transition cursor-pointer ';
                if (isStart || isEnd || isPreviewEnd) cls += 'bg-gold text-ink font-semibold rounded ';
                else if (inRange) cls += 'bg-gold/15 text-cream/90 ';
                else cls += 'text-cream/75 hover:bg-gold/15 rounded ';
                if (isToday && !isStart && !isEnd && !isPreviewEnd) cls += 'ring-1 ring-inset ring-gold/40 rounded ';

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => pickDay(iso)}
                    onMouseEnter={() => setHover(iso)}
                    className={cls}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gold/10">
              <button
                type="button"
                onClick={() => { setDraftFrom(''); setDraftTo(''); onChange('', ''); close(); }}
                className="text-xs text-cream/40 hover:text-cream/70 transition"
              >
                Limpiar
              </button>
              <button
                type="button"
                disabled={!draftFrom}
                onClick={() => { onChange(draftFrom, draftTo || draftFrom); close(); }}
                className="px-3 py-1.5 rounded-md bg-gold text-ink text-xs font-semibold hover:bg-gold/90 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
