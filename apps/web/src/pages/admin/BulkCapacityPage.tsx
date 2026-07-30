import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminDateAvailabilityRow } from '../../lib/adminApi';
import Checkbox from '../../components/Checkbox';
import InlineNumberInput from '../../components/admin/InlineNumberInput';
import ProductCapacityCalendar from './sections/ProductCapacityCalendar';

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DraftOverride { capacity: number; is_closed: boolean }

type CupoView = 'table' | 'calendar';

export default function BulkCapacityPage() {
  const [view, setView] = useState<CupoView>('calendar');

  // ── Horario límite global ────────────────────────────────
  const [cutoff, setCutoff] = useState<string>('');
  const [cutoffSaving, setCutoffSaving] = useState(false);
  const [cutoffMsg, setCutoffMsg] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings.getBookingCutoff()
      .then((d) => setCutoff(d.time ?? ''))
      .catch(() => { /* no bloquea el resto de la página */ });
  }, []);

  const handleSaveCutoff = async () => {
    setCutoffSaving(true);
    setCutoffMsg(null);
    try {
      await adminApi.settings.updateBookingCutoff(cutoff || null);
      setCutoffMsg('✓ Guardado');
      setTimeout(() => setCutoffMsg(null), 3000);
    } catch (err) {
      setCutoffMsg(`Error: ${(err as AdminApiError).message}`);
    } finally {
      setCutoffSaving(false);
    }
  };

  // ── Horizonte de venta (hasta cuántos meses a futuro se puede reservar) ──
  const [horizon, setHorizon] = useState<string>('');
  const [horizonSaving, setHorizonSaving] = useState(false);
  const [horizonMsg, setHorizonMsg] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings.getBookingHorizon()
      .then((d) => setHorizon(d.months != null ? String(d.months) : ''))
      .catch(() => { /* no bloquea el resto de la página */ });
  }, []);

  const handleSaveHorizon = async () => {
    setHorizonSaving(true);
    setHorizonMsg(null);
    try {
      const months = horizon === '' ? null : Number.parseInt(horizon, 10);
      await adminApi.settings.updateBookingHorizon(months);
      setHorizonMsg('✓ Guardado');
      setTimeout(() => setHorizonMsg(null), 3000);
    } catch (err) {
      setHorizonMsg(`Error: ${(err as AdminApiError).message}`);
    } finally {
      setHorizonSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <Link to="/admin/products" className="text-sm text-gold-soft hover:text-gold">
        ← Volver a productos
      </Link>

      <header className="mt-3 mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Operaciones</p>
        <h1 className="mt-2 font-display text-4xl text-cream">Cupos</h1>
        <p className="mt-1 text-sm text-cream/50">
          Configuración operativa global y cupo por fecha para cada tier.
        </p>
      </header>

      {/* ── Horario límite global ── */}
      <section className="rounded-xl border border-gold/15 bg-ink-soft/50 p-6 mb-8">
        <h2 className="font-display text-2xl text-cream">Horario límite de reservas</h2>
        <p className="mt-2 text-sm text-cream/60 max-w-xl">
          Después de esta hora <span className="text-cream/80">(Buenos Aires, UTC-3)</span> no se aceptan
          reservas para el día en curso en ningún show. Dejá vacío para no aplicar restricción.
        </p>
        <div className="mt-5 flex items-center gap-4 flex-wrap">
          <div>
            <label htmlFor="cutoff-time" className="block text-sm text-cream/70 mb-1.5">Hora límite</label>
            <input
              id="cutoff-time"
              type="time"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              className="input w-36"
            />
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button
              type="button"
              onClick={handleSaveCutoff}
              disabled={cutoffSaving}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {cutoffSaving ? 'Guardando...' : 'Guardar'}
            </button>
            {cutoff && (
              <button
                type="button"
                onClick={() => { setCutoff(''); }}
                className="text-xs text-cream/40 hover:text-cream/70"
              >
                Quitar límite
              </button>
            )}
          </div>
          {cutoffMsg && (
            <p className={`text-sm mt-5 ${cutoffMsg.startsWith('Error') ? 'text-bordeaux-light' : 'text-gold'}`}>
              {cutoffMsg}
            </p>
          )}
        </div>
        {cutoff && (
          <p className="mt-3 text-xs text-cream/40">
            Actualmente: reservas del día se aceptan hasta las <span className="text-cream/70">{cutoff}</span> hs.
          </p>
        )}
      </section>

      {/* ── Horizonte de venta ── */}
      <section className="rounded-xl border border-gold/15 bg-ink-soft/50 p-6 mb-8">
        <h2 className="font-display text-2xl text-cream">Horizonte de venta</h2>
        <p className="mt-2 text-sm text-cream/60 max-w-xl">
          Hasta cuántos meses a futuro se puede reservar — aplica al checkout público, a la carga
          manual de admin/vendedor y a reprogramar una reserva existente. Ej: 12 = un año, 24 = dos
          años. Dejá vacío para no aplicar tope.
        </p>
        <div className="mt-5 flex items-center gap-4 flex-wrap">
          <div>
            <label htmlFor="horizon-months" className="block text-sm text-cream/70 mb-1.5">Meses hacia adelante</label>
            <input
              id="horizon-months"
              type="number" min={1} max={36}
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              className="input w-36"
              placeholder="Sin tope"
            />
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button
              type="button"
              onClick={handleSaveHorizon}
              disabled={horizonSaving}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {horizonSaving ? 'Guardando...' : 'Guardar'}
            </button>
            {horizon && (
              <button
                type="button"
                onClick={() => { setHorizon(''); }}
                className="text-xs text-cream/40 hover:text-cream/70"
              >
                Quitar tope
              </button>
            )}
          </div>
          {horizonMsg && (
            <p className={`text-sm mt-5 ${horizonMsg.startsWith('Error') ? 'text-bordeaux-light' : 'text-gold'}`}>
              {horizonMsg}
            </p>
          )}
        </div>
        {horizon && (
          <p className="mt-3 text-xs text-cream/40">
            Actualmente: se vende hasta <span className="text-cream/70">{horizon}</span> mes{horizon === '1' ? '' : 'es'} hacia adelante.
          </p>
        )}
      </section>

      <div className="flex gap-1 border-b border-gold/10 mb-6">
        {(['calendar', 'table'] as const).map((v) => (
          <button
            key={v} type="button" onClick={() => setView(v)}
            className={`px-4 py-2.5 text-sm transition border-b-2 -mb-px ${
              view === v ? 'border-gold text-gold' : 'border-transparent text-cream/60 hover:text-cream'
            }`}
          >
            {v === 'table' ? 'Tabla' : 'Calendario'}
          </button>
        ))}
      </div>

      {view === 'table' ? <CapacityByDate /> : <ProductCapacityCalendar />}
    </div>
  );
}

// ── Cupo por fecha: ver, editar individualmente o en masa ──────────────────────
// Una sola fecha, TODAS las opciones activas: cupo total, ocupado (órdenes + holds +
// addons pendientes, vía option_booked_pax en el backend) y disponible — misma cuenta
// que usa el checkout en ese instante, no una foto vieja. La edición masiva por default
// escribe un override puntual para esa fecha (option_availability); tildando "aplicar
// como default permanente" cambia default_capacity_per_day del tier en cambio (todos
// los días sin excepción propia).
function CapacityByDate() {
  const [date, setDate] = useState(todayLocalISO);
  const [rows, setRows] = useState<AdminDateAvailabilityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Map<number, DraftOverride>>(new Map());

  // ── Selección + acción masiva ─────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkInput, setBulkInput] = useState('');
  const [bulkPermanent, setBulkPermanent] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = () => {
    if (!date) return;
    setLoading(true);
    setError(null);
    adminApi.products.availabilityByDate(date)
      .then((data) => { setRows(data); setDraft(new Map()); setSelected(new Set()); })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : (err as Error).message))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [date]);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const byProduct = new Map<number, { product_name: string; rows: AdminDateAvailabilityRow[] }>();
    for (const r of rows) {
      if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, { product_name: r.product_name, rows: [] });
      byProduct.get(r.product_id)!.rows.push(r);
    }
    return [...byProduct.values()];
  }, [rows]);

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

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(dirtyRows.map((r) => {
        const d = effective(r);
        return adminApi.options.availability.upsert(r.option_id, {
          date, capacity_override: d.capacity, is_closed: d.is_closed,
        });
      }));
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Vuelve al cupo default del tier para esta fecha (borra el override si existía).
  const handleReset = async (r: AdminDateAvailabilityRow) => {
    setSaving(true);
    setError(null);
    try {
      if (r.override_id != null) await adminApi.options.availability.delete(r.override_id);
      setDraft((prev) => { const n = new Map(prev); n.delete(r.option_id); return n; });
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Selección ────────────────────────────────────────────
  const allOptionIds = useMemo(() => (rows ?? []).map((r) => r.option_id), [rows]);
  const someSelected = selected.size > 0;
  const allSelected = allOptionIds.length > 0 && selected.size === allOptionIds.length;

  const toggleOption = (id: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleGroup = (g: { rows: AdminDateAvailabilityRow[] }) => {
    const ids = g.rows.map((r) => r.option_id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      allSel ? ids.forEach((id) => n.delete(id)) : ids.forEach((id) => n.add(id));
      return n;
    });
  };

  const toggleAll = () =>
    setSelected(selected.size === allOptionIds.length ? new Set() : new Set(allOptionIds));

  // Asigna el mismo cupo a todos los tiers seleccionados de una vez — por default, como
  // override puntual de ESTA fecha; con "permanente" tildado, cambia el default del tier
  // (todos los días sin excepción propia), sin tocar el override de esta fecha si ya había.
  const handleBulkApply = async () => {
    const val = Number.parseInt(bulkInput, 10);
    if (Number.isNaN(val) || val < 0 || !selected.size || !rows) return;
    setApplying(true);
    setError(null);
    try {
      if (bulkPermanent) {
        await Promise.all(
          [...selected].map((id) => adminApi.products.options.update(id, { default_capacity_per_day: val })),
        );
      } else {
        await Promise.all(
          [...selected].map((id) => {
            const r = rows.find((x) => x.option_id === id)!;
            return adminApi.options.availability.upsert(id, {
              date, capacity_override: val, is_closed: effective(r).is_closed,
            });
          }),
        );
      }
      setBulkInput('');
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <section>
      <h2 className="font-display text-2xl text-cream mb-1">Cupo por fecha</h2>
      <p className="text-sm text-cream/50 mb-5">
        Elegí una fecha y mirá, para cada casa/tier, cuánto cupo queda — se calcula en vivo
        contra reservas confirmadas, pendientes y checkouts en curso (igual que el sitio público).
        Editá uno por uno, o seleccioná varios para asignar el mismo cupo de una sola vez.
      </p>

      <div className="mb-5">
        <label htmlFor="avail-date" className="block text-sm text-cream/70 mb-1.5">Fecha</label>
        <input
          id="avail-date" type="date" value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input w-48"
        />
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {/* Barra de acción */}
      {(someSelected || dirtyRows.length > 0) && (
        <div className="rounded-lg border border-gold/25 bg-ink-soft/70 px-5 py-3.5 mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          {someSelected && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-cream/60">
                <span className="text-gold font-semibold">{selected.size}</span> seleccionado{selected.size === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} placeholder="Cupo"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBulkApply()}
                  className="input w-24 text-sm text-right tabular-nums"
                />
                <button
                  type="button" onClick={handleBulkApply}
                  disabled={applying || bulkInput === '' || Number.parseInt(bulkInput, 10) < 0}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {applying ? 'Aplicando...' : 'Asignar cupo'}
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-cream/60">
                <Checkbox checked={bulkPermanent} onChange={setBulkPermanent} />
                Aplicar como default permanente (todos los días, no solo {date})
              </label>
              <button
                type="button" onClick={() => setSelected(new Set())}
                className="text-xs text-cream/40 hover:text-cream"
              >
                Deseleccionar
              </button>
            </div>
          )}
          {dirtyRows.length > 0 && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm text-gold-soft">
                {dirtyRows.length} cambio{dirtyRows.length === 1 ? '' : 's'} pendiente{dirtyRows.length === 1 ? '' : 's'}
              </span>
              <button
                type="button" onClick={handleSaveAll} disabled={saving}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-ink-soft/60 animate-pulse" />)}
        </div>
      )}

      {!loading && rows && rows.length === 0 && (
        <p className="text-cream/50 text-sm">No hay opciones activas configuradas.</p>
      )}

      {!loading && grouped.length > 0 && (
        <div className="rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/40 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3 pl-4 pr-2 w-8">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={toggleAll}
                    aria-label="Seleccionar todos los tiers"
                  />
                </th>
                <th className="text-left py-3 px-3">Producto / Tier</th>
                <th className="text-center py-3 px-3 w-24">Cerrado</th>
                <th className="text-right py-3 px-3 w-28">Capacidad</th>
                <th className="text-right py-3 px-3 w-24">Ocupado</th>
                <th className="text-right py-3 px-3 w-24">Disponible</th>
                <th className="text-right py-3 pr-4 pl-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap((g) => {
                const ids = g.rows.map((r) => r.option_id);
                const allGroupSel = ids.length > 0 && ids.every((id) => selected.has(id));
                const someGroupSel = ids.some((id) => selected.has(id));
                return [
                  <tr key={`gp-${g.product_name}`} className="border-t border-gold/10 bg-ink-soft/30">
                    <td className="py-2.5 pl-4 pr-2">
                      <Checkbox
                        checked={allGroupSel}
                        indeterminate={someGroupSel && !allGroupSel}
                        onChange={() => toggleGroup(g)}
                        aria-label={`Seleccionar todos los tiers de ${g.product_name}`}
                      />
                    </td>
                    <td colSpan={6} className="py-2.5 px-3">
                      <span className="font-semibold text-cream">{g.product_name}</span>
                    </td>
                  </tr>,
                  ...g.rows.map((r) => {
                    const eff = effective(r);
                    const dirty = isDirty(r);
                    const hasOverride = r.override_id != null || dirty;
                    const isSel = selected.has(r.option_id);
                    const remainingNow = Math.max(0, eff.capacity - r.booked);
                    return (
                      <tr
                        key={`o-${r.option_id}`}
                        className={`border-t border-gold/5 transition-colors ${
                          dirty || isSel ? 'bg-gold/5' : 'hover:bg-gold/5'
                        }`}
                      >
                        <td className="py-2 pl-4 pr-2">
                          <Checkbox checked={isSel} onChange={() => toggleOption(r.option_id)} aria-label={`Seleccionar ${r.option_name}`} />
                        </td>
                        <td className="py-2 px-3 pl-9">
                          <span className={r.is_option_active ? 'text-cream' : 'text-cream/40'}>{r.option_name}</span>
                          <span className="ml-2 text-xs text-cream/25 font-mono">{r.option_code}</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Checkbox
                            checked={eff.is_closed}
                            onChange={(checked) => setClosed(r, checked)}
                            aria-label={`Cerrar ${r.option_name} para ${date}`}
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <InlineNumberInput
                            value={eff.capacity} min={0} dirty={dirty}
                            onChange={(val) => setCapacity(r, val)}
                          />
                        </td>
                        <td className="py-2 px-3 text-right text-cream/70 tabular-nums text-xs">{r.booked}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-sm font-semibold">
                          {eff.is_closed ? (
                            <span className="text-cream/30">—</span>
                          ) : (
                            <span className={remainingNow > 0 ? 'text-gold' : 'text-bordeaux-light'}>{remainingNow}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 pl-3 text-right">
                          {hasOverride && (
                            <button
                              type="button" onClick={() => handleReset(r)} disabled={saving}
                              className="text-xs text-cream/40 hover:text-cream disabled:opacity-50"
                              title={`Volver al cupo default (${r.default_capacity_per_day}) para esta fecha`}
                            >
                              Restablecer
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
