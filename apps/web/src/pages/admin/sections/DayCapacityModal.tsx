import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminDateAvailabilityRow } from '../../../lib/adminApi';
import Checkbox from '../../../components/Checkbox';
import InlineNumberInput from '../../../components/admin/InlineNumberInput';

interface Props {
  date: string;
  productId: number;
  productName: string;
  onClose: () => void;
  onSaved: () => void;
}

interface DraftOverride { capacity: number; is_closed: boolean }

const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
// 1=Lun..7=Dom — mismo mapeo que se usa en todo el resto del código (catalog.ts, calendario admin).
function isoDow(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getDay() || 7;
}

/**
 * Editor de cupo de UNA casa para UN día, abierto desde un click en el calendario.
 * Reutiliza el endpoint ya existente (todas las casas para esa fecha) filtrado acá al
 * producto elegido, en vez de un endpoint nuevo — el mismo que ya usa la tabla "Cupo
 * por fecha". Solo reimplementa lo mínimo (sin selección múltiple ni "default
 * permanente", que acá no aplican) para no tocar la lógica de esa tabla.
 */
export default function DayCapacityModal({ date, productId, productName, onClose, onSaved }: Readonly<Props>) {
  const [rows, setRows] = useState<AdminDateAvailabilityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Map<number, DraftOverride>>(new Map());

  useEffect(() => {
    let cancelled = false;
    adminApi.products.availabilityByDate(date)
      .then((all) => { if (!cancelled) setRows(all.filter((r) => r.product_id === productId)); })
      .catch((err) => { if (!cancelled) setError(err instanceof AdminApiError ? err.message : (err as Error).message); });
    return () => { cancelled = true; };
  }, [date, productId]);

  const effective = (r: AdminDateAvailabilityRow): DraftOverride =>
    draft.get(r.option_id) ?? { capacity: r.capacity, is_closed: r.is_closed };

  const isDirty = (r: AdminDateAvailabilityRow): boolean => {
    const d = draft.get(r.option_id);
    return d != null && (d.capacity !== r.capacity || d.is_closed !== r.is_closed);
  };

  const setCapacity = (r: AdminDateAvailabilityRow, capacity: number) =>
    setDraft((prev) => new Map(prev).set(r.option_id, { ...effective(r), capacity }));

  const setClosed = (r: AdminDateAvailabilityRow, is_closed: boolean) =>
    setDraft((prev) => new Map(prev).set(r.option_id, { ...effective(r), is_closed }));

  const dirtyRows = useMemo(() => (rows ?? []).filter(isDirty), [rows, draft]);

  // Todas las filas comparten el mismo producto → mismo product_available_days.
  const dow = useMemo(() => isoDow(date), [date]);
  const houseClosedThisWeekday = Boolean(rows?.length) && !rows![0].product_available_days.includes(dow);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(dirtyRows.map((r) => {
        const d = effective(r);
        return adminApi.options.availability.upsert(r.option_id, {
          date, capacity_override: d.capacity, is_closed: d.is_closed,
        });
      }));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
      <div className="relative w-full max-w-lg rounded-2xl bg-ink-soft border border-gold/20 my-8 animate-modal-panel">
        <button
          type="button" onClick={onClose} aria-label="Cerrar"
          className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
        >
          ×
        </button>
        <header className="p-6 border-b border-gold/10">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Cupo del día</p>
          <h2 className="mt-2 font-display text-2xl text-cream pr-10">{productName}</h2>
          <p className="mt-1 text-sm text-cream/50">{date}</p>
        </header>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">{error}</div>
          )}

          {!rows && !error && (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-ink/60 animate-pulse" />)}
            </div>
          )}

          {rows && rows.length === 0 && (
            <p className="text-sm text-cream/50">Esta casa no tiene tiers activos.</p>
          )}

          {houseClosedThisWeekday && (
            <div className="rounded-md border border-gold/25 bg-gold/5 p-3 text-sm text-gold-soft">
              La casa no trabaja los <span className="text-gold font-medium">{WEEKDAY_NAMES[dow - 1]}</span> —
              está configurado así para todos los tiers, no se puede abrir tier por tier desde acá. Para
              cambiarlo, andá a{' '}
              <Link to={`/admin/products/${productId}`} className="underline hover:text-gold" onClick={onClose}>
                Datos generales de la casa
              </Link>.
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((r) => {
                const eff = effective(r);
                const dirty = isDirty(r);
                const remainingNow = Math.max(0, eff.capacity - r.booked);
                return (
                  <div key={r.option_id} className="rounded-lg border border-gold/10 bg-ink/30 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-cream truncate">{r.option_name}</p>
                        <p className="text-xs text-cream/40 font-mono">{r.option_code}</p>
                      </div>
                      <label className={`flex items-center gap-1.5 text-xs shrink-0 ${houseClosedThisWeekday ? 'text-cream/30' : 'text-cream/60'}`}>
                        <Checkbox
                          checked={houseClosedThisWeekday || eff.is_closed}
                          disabled={houseClosedThisWeekday}
                          onChange={(checked) => setClosed(r, checked)}
                          aria-label={`Cerrar ${r.option_name} para ${date}`}
                        />
                        Cerrado
                      </label>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4 text-xs text-cream/60">
                        <span>Ocupado: <span className="text-cream/80 tabular-nums">{r.booked}</span></span>
                        <span>Disponible: <span className={`tabular-nums font-semibold ${remainingNow > 0 ? 'text-gold' : 'text-bordeaux-light'}`}>{houseClosedThisWeekday || eff.is_closed ? '—' : remainingNow}</span></span>
                      </div>
                      <InlineNumberInput value={eff.capacity} min={0} dirty={dirty} disabled={houseClosedThisWeekday} onChange={(val) => setCapacity(r, val)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="p-6 border-t border-gold/10 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-cream/50 hover:text-cream">
            Cancelar
          </button>
          <button
            type="button" onClick={handleSave}
            disabled={saving || dirtyRows.length === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? 'Guardando...' : `Guardar${dirtyRows.length ? ` (${dirtyRows.length})` : ''}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
