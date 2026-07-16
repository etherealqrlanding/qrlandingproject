import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminOption, type AdminProductDetail } from '../../lib/adminApi';
import Checkbox from '../../components/Checkbox';

function withUpdatedCaps(
  products: AdminProductDetail[],
  dirtyIds: Set<number>,
  caps: Map<number, number>,
): AdminProductDetail[] {
  return products.map((p) => ({
    ...p,
    options: p.options.map((opt) =>
      dirtyIds.has(opt.id) && caps.has(opt.id)
        ? { ...opt, default_capacity_per_day: caps.get(opt.id)! }
        : opt,
    ),
  }));
}

function withBulkCap(
  products: AdminProductDetail[],
  selected: Set<number>,
  val: number,
): AdminProductDetail[] {
  return products.map((p) => ({
    ...p,
    options: p.options.map((opt) =>
      selected.has(opt.id) ? { ...opt, default_capacity_per_day: val } : opt,
    ),
  }));
}

export default function BulkCapacityPage() {
  const [products, setProducts] = useState<AdminProductDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Horario límite global ────────────────────────────────
  const [cutoff, setCutoff] = useState<string>('');
  const [cutoffSaving, setCutoffSaving] = useState(false);
  const [cutoffMsg, setCutoffMsg] = useState<string | null>(null);

  // ── Cupos — ediciones inline pendientes ─────────────────
  const [draftCaps, setDraftCaps] = useState<Map<number, number>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkInput, setBulkInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, cutoffData] = await Promise.all([
          adminApi.products.list(),
          adminApi.settings.getBookingCutoff(),
        ]);
        const details = await Promise.all(list.map((p) => adminApi.products.get(p.id)));
        setProducts(details.filter((d): d is AdminProductDetail => d !== null));
        setCutoff(cutoffData.time ?? '');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allOptionIds = useMemo(() => products.flatMap((p) => p.options.map((o) => o.id)), [products]);
  const allOpts = useMemo(() => products.flatMap((p) => p.options), [products]);

  const getCap = (opt: AdminOption) => draftCaps.get(opt.id) ?? opt.default_capacity_per_day;

  const dirtyIds = useMemo(() => {
    const dirty = new Set<number>();
    for (const [id, val] of draftCaps) {
      if (allOpts.find((o) => o.id === id)?.default_capacity_per_day !== val) dirty.add(id);
    }
    return dirty;
  }, [draftCaps, allOpts]);

  // ── Selección ────────────────────────────────────────────
  const toggleOption = (id: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleProduct = (p: AdminProductDetail) => {
    const ids = p.options.map((o) => o.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      allSel ? ids.forEach((id) => n.delete(id)) : ids.forEach((id) => n.add(id));
      return n;
    });
  };

  const toggleAll = () =>
    setSelected(selected.size === allOptionIds.length ? new Set() : new Set(allOptionIds));

  // ── Guardar horario límite ───────────────────────────────
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

  // ── Guardar cupos inline ─────────────────────────────────
  const handleSaveAll = async () => {
    if (!dirtyIds.size) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        [...dirtyIds].map((id) =>
          adminApi.products.options.update(id, { default_capacity_per_day: draftCaps.get(id)! }),
        ),
      );
      setProducts((prev) => withUpdatedCaps(prev, dirtyIds, draftCaps));
      setDraftCaps((prev) => { const n = new Map(prev); dirtyIds.forEach((id) => n.delete(id)); return n; });
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Asignar cupo masivo ──────────────────────────────────
  const handleBulkApply = async () => {
    const val = Number.parseInt(bulkInput, 10);
    if (!val || val < 1 || !selected.size) return;
    setApplying(true);
    setError(null);
    try {
      await Promise.all(
        [...selected].map((id) =>
          adminApi.products.options.update(id, { default_capacity_per_day: val }),
        ),
      );
      setProducts((prev) => withBulkCap(prev, selected, val));
      setDraftCaps((prev) => { const n = new Map(prev); selected.forEach((id) => n.delete(id)); return n; });
      setBulkInput('');
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const handleCapChange = (optId: number, val: number) => {
    setDraftCaps((prev) => new Map(prev).set(optId, val));
  };

  const someSelected = selected.size > 0;
  const allSelected = allOptionIds.length > 0 && selected.size === allOptionIds.length;
  const hasDirty = dirtyIds.size > 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <Link to="/admin/products" className="text-sm text-gold-soft hover:text-gold">
        ← Volver a productos
      </Link>

      <header className="mt-3 mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Operaciones</p>
        <h1 className="mt-2 font-display text-4xl text-cream">Panel de gestión</h1>
        <p className="mt-1 text-sm text-cream/50">
          Configuración operativa global y gestión de cupos por tier.
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

      {/* ── Gestión de cupos ── */}
      <section>
        <h2 className="font-display text-2xl text-cream mb-1">Cupos por tier</h2>
        <p className="text-sm text-cream/50 mb-5">
          Cupos disponibles por noche para cada opción. Editá individualmente o seleccioná varios para asignar el mismo valor de una vez.
        </p>

        {error && (
          <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">
            {error}
          </div>
        )}

        {/* Barra de acción */}
        {(someSelected || hasDirty) && (
          <div className="rounded-lg border border-gold/25 bg-ink-soft/70 px-5 py-3.5 mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            {someSelected && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-cream/60">
                  <span className="text-gold font-semibold">{selected.size}</span> seleccionado{selected.size === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} placeholder="Cupo"
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleBulkApply()}
                    className="input w-24 text-sm text-right tabular-nums"
                  />
                  <button
                    type="button" onClick={handleBulkApply}
                    disabled={applying || !bulkInput || Number.parseInt(bulkInput, 10) < 1}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {applying ? 'Aplicando...' : 'Asignar cupo'}
                  </button>
                </div>
                <button
                  type="button" onClick={() => setSelected(new Set())}
                  className="text-xs text-cream/40 hover:text-cream"
                >
                  Deseleccionar
                </button>
              </div>
            )}
            {hasDirty && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm text-gold-soft">
                  {dirtyIds.size} cambio{dirtyIds.size === 1 ? '' : 's'} pendiente{dirtyIds.size === 1 ? '' : 's'}
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
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-ink-soft/60 animate-pulse" />)}
          </div>
        )}

        {!loading && products.length === 0 && (
          <p className="text-cream/50 text-sm">No hay productos configurados.</p>
        )}

        {!loading && products.length > 0 && (
          <>
            {/* ── Mobile: cards ── */}
            <div className="md:hidden space-y-4">
              {products.map((p) => {
                const ids = p.options.map((o) => o.id);
                const allProdSel = ids.length > 0 && ids.every((id) => selected.has(id));
                const someProdSel = ids.some((id) => selected.has(id));
                return (
                  <div key={`pm-${p.id}`} className="rounded-xl border border-gold/10 overflow-hidden">
                    {/* Cabecera del producto */}
                    <div className="px-4 py-3 bg-ink-soft/30 flex items-center gap-3 border-b border-gold/10">
                      <Checkbox
                        checked={allProdSel}
                        indeterminate={someProdSel && !allProdSel}
                        onChange={() => toggleProduct(p)}
                        disabled={ids.length === 0}
                        aria-label={`Seleccionar todos los tiers de ${p.name}`}
                      />
                      <div className="min-w-0">
                        <p className="text-cream font-semibold text-sm truncate">{p.name}</p>
                        <p className="text-[10px] text-cream/40 truncate">
                          {p.venue_name} · {p.options.length} tier{p.options.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    {/* Opciones */}
                    {p.options.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-cream/30 italic">Sin tiers configurados</p>
                    ) : (
                      <div className="divide-y divide-gold/5">
                        {p.options.map((opt) => {
                          const isCapDirty = draftCaps.has(opt.id) && draftCaps.get(opt.id) !== opt.default_capacity_per_day;
                          const isSel = selected.has(opt.id);
                          return (
                            <div
                              key={`om-${opt.id}`}
                              className={`px-4 py-3 flex items-center gap-3 transition-colors ${isSel ? 'bg-gold/5' : ''}`}
                            >
                              <Checkbox
                                checked={isSel}
                                onChange={() => toggleOption(opt.id)}
                                aria-label={`Seleccionar ${opt.name_es}`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${opt.is_active ? 'text-cream' : 'text-cream/40'}`}>{opt.name_es}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-[10px] font-mono text-cream/30">{opt.code}</span>
                                  {opt.is_active
                                    ? <span className="inline-flex items-center gap-1 text-[10px] text-gold/80"><span className="w-1 h-1 rounded-full bg-gold/60 inline-block" />Visible</span>
                                    : <span className="text-[10px] text-cream/30">Oculto</span>
                                  }
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[10px] text-cream/35 mb-1">Cupo/noche</p>
                                <InlineNumberInput
                                  value={getCap(opt)} min={1} dirty={isCapDirty}
                                  onChange={(val) => handleCapChange(opt.id, val)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Desktop: tabla ── */}
            <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden">
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
                    <th className="text-center py-3 px-3 w-24">Estado</th>
                    <th className="text-right py-3 pr-4 pl-3 w-32">Cupo / noche</th>
                  </tr>
                </thead>
                <tbody>
                  {products.flatMap((p) => {
                    const ids = p.options.map((o) => o.id);
                    const allProdSel = ids.length > 0 && ids.every((id) => selected.has(id));
                    const someProdSel = ids.some((id) => selected.has(id));
                    return [
                      <tr key={`p-${p.id}`} className="border-t border-gold/10 bg-ink-soft/30">
                        <td className="py-2.5 pl-4 pr-2">
                          <Checkbox
                            checked={allProdSel}
                            indeterminate={someProdSel && !allProdSel}
                            onChange={() => toggleProduct(p)}
                            disabled={ids.length === 0}
                            aria-label={`Seleccionar todos los tiers de ${p.name}`}
                          />
                        </td>
                        <td colSpan={3} className="py-2.5 px-3">
                          <span className="font-semibold text-cream">{p.name}</span>
                          <span className="ml-2 text-xs text-cream/40">{p.venue_name}</span>
                          <span className="ml-2 text-xs text-cream/25">
                            {p.options.length} tier{p.options.length === 1 ? '' : 's'}
                          </span>
                        </td>
                      </tr>,
                      ...p.options.map((opt) => {
                        const isCapDirty = draftCaps.has(opt.id) && draftCaps.get(opt.id) !== opt.default_capacity_per_day;
                        const isSel = selected.has(opt.id);
                        return (
                          <tr key={`o-${opt.id}`} className={`border-t border-gold/5 transition-all duration-200 ${isSel ? 'bg-gold/5' : 'hover:bg-gold/5 hover:shadow-[inset_0_0_0_1px_rgba(200,168,90,0.35)]'}`}>
                            <td className="py-2 pl-4 pr-2">
                              <Checkbox checked={isSel} onChange={() => toggleOption(opt.id)} aria-label={`Seleccionar ${opt.name_es}`} />
                            </td>
                            <td className="py-2 px-3 pl-9">
                              <span className={opt.is_active ? 'text-cream' : 'text-cream/40'}>{opt.name_es}</span>
                              <span className="ml-2 text-xs text-cream/25 font-mono">{opt.code}</span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {opt.is_active
                                ? <span className="inline-flex items-center gap-1 text-xs text-gold/80"><span className="w-1.5 h-1.5 rounded-full bg-gold/60 inline-block" />Visible</span>
                                : <span className="text-xs text-cream/30">Oculto</span>
                              }
                            </td>
                            <td className="py-2 pr-4 pl-3 text-right">
                              <InlineNumberInput
                                value={getCap(opt)} min={1} dirty={isCapDirty}
                                onChange={(val) => handleCapChange(opt.id, val)}
                              />
                            </td>
                          </tr>
                        );
                      }),
                      ...(p.options.length === 0
                        ? [<tr key={`p-${p.id}-empty`} className="border-t border-gold/5">
                            <td colSpan={4} className="py-2.5 pl-9 text-xs text-cream/30 italic">Sin tiers configurados</td>
                          </tr>]
                        : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function InlineNumberInput({ value, min, dirty, onChange }: Readonly<{
  value: number; min: number; dirty: boolean; onChange: (val: number) => void;
}>) {
  return (
    <input
      type="number" min={min}
      value={value}
      onChange={(e) => {
        const v = Number.parseInt(e.target.value, 10);
        if (!Number.isNaN(v) && v >= min) onChange(v);
      }}
      className={`w-24 text-right rounded px-2 py-1 text-sm bg-ink tabular-nums
        focus:outline-none focus:ring-1 transition-all
        ${dirty
          ? 'border border-gold text-gold focus:ring-gold/50'
          : 'border border-gold/15 text-cream/70 focus:ring-gold/30'
        }`}
    />
  );
}
