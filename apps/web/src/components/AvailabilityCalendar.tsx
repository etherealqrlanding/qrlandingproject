import { useEffect, useMemo, useState } from 'react';
import { api, type AvailabilityDay } from '../lib/api';

interface Props {
  optionId: number;
  value: string;       // YYYY-MM-DD — fecha seleccionada
  currentDate: string; // YYYY-MM-DD — fecha original de la reserva (destacada con borde)
  onChange: (date: string) => void;
}

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

function startOfMonth(y: number, m: number) { return new Date(y, m, 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

export default function AvailabilityCalendar({ optionId, value, currentDate, onChange }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const horizon = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  }, []);

  const [viewDate, setViewDate] = useState<Date>(() => {
    const [y, m] = value.split('-').map(Number);
    return startOfMonth(y, m - 1);
  });
  const [avMap, setAvMap] = useState<Map<string, AvailabilityDay>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.availability.forOption(optionId, today, horizon)
      .then((days) => setAvMap(new Map(days.map((d) => [d.date, d]))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [optionId, today, horizon]);

  const { cells, monthLabel } = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDow = (startOfMonth(y, m).getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    const cells: Array<string | null> = [
      ...Array<null>(firstDow).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) =>
        `${y}-${pad(m + 1)}-${pad(i + 1)}`
      ),
    ];
    const raw = new Date(y, m, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return { cells, monthLabel: raw.charAt(0).toUpperCase() + raw.slice(1) };
  }, [viewDate]);

  const minMonth = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const maxMonth = useMemo(() => { const d = new Date(horizon); return new Date(d.getFullYear(), d.getMonth(), 1); }, [horizon]);

  const canPrev = viewDate > minMonth;
  const canNext = viewDate < maxMonth;
  const showOriginalLegend = currentDate !== value;

  return (
    <div className="rounded-lg border border-gold/20 bg-ink/30 p-3 select-none">
      {/* Navegación de mes */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setViewDate(addMonths(viewDate, -1))} disabled={!canPrev}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-gold/15 transition text-cream/60 disabled:opacity-25 text-lg">‹</button>
        <span className="text-sm font-medium text-cream/90">{monthLabel}</span>
        <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} disabled={!canNext}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-gold/15 transition text-cream/60 disabled:opacity-25 text-lg">›</button>
      </div>

      {/* Encabezado de días */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-cream/30 py-0.5">{d}</div>
        ))}
      </div>

      {/* Grilla de días */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((iso, idx) => {
          if (!iso) return <div key={idx} />;

          const avDay = avMap.get(iso);
          const status = avDay?.status;
          const isPast = iso < today || iso > horizon;
          const isDisabled = isPast || status === 'full' || status === 'closed';
          const isSelected = iso === value;
          const isOriginal = iso === currentDate && !isSelected;
          const dayNum = Number(iso.slice(-2));

          let cls = 'relative flex items-center justify-center h-8 rounded text-xs font-normal transition ';
          if (isSelected) {
            cls += 'bg-gold text-ink font-semibold';
          } else if (isOriginal) {
            cls += 'border border-dashed border-gold/60 text-gold-soft';
          } else if (isDisabled) {
            cls += 'text-cream/20 cursor-default';
          } else {
            cls += 'text-cream/75 hover:bg-gold/15 cursor-pointer';
          }

          return (
            <button key={iso} type="button" disabled={isDisabled}
              onClick={() => onChange(iso)}
              className={cls}
            >
              {dayNum}
              {status === 'low' && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
              )}
              {(status === 'full' || status === 'closed') && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500/50" />
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 pt-2 border-t border-gold/10 text-[10px] text-cream/35">
        {loading
          ? <span>Cargando disponibilidad...</span>
          : (
            <>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Pocos lugares
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 inline-block" />Sin cupos
              </span>
              {showOriginalLegend && (
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded border border-dashed border-gold/60 inline-block" />Fecha actual
                </span>
              )}
            </>
          )
        }
      </div>
    </div>
  );
}
