import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminProductSummary, type AdminProductOptionPreview } from '../../lib/adminApi';
import { useExchangeRate } from '../../lib/useExchangeRate';
import Checkbox from '../../components/Checkbox';
import { useReturnHighlight } from '../../hooks/useReturnHighlight';

const LAST_VIEWED_KEY = 'lastViewedProductId';

const SKELETON_KEYS = ['sk-a', 'sk-b', 'sk-c'];

const usd = (n: number | null | undefined) =>
  n == null ? null : `USD ${Math.round(n).toLocaleString('en-US')}`;
const ars = (n: number | null | undefined) =>
  n == null ? null : `ARS ${Math.round(n).toLocaleString('es-AR')}`;

/** Neto adulto llevado a USD (convierte desde ARS con la tasa si el tier carga el neto en pesos). */
function netAdultUsd(o: AdminProductOptionPreview, rate: number | null): number | null {
  if (o.net_price_currency === 'ARS') {
    return o.net_price_adult_ars != null && rate ? o.net_price_adult_ars / rate : null;
  }
  return o.net_price_adult_usd;
}

// ── Desglose de tiers (precios públicos, netos, margen, cupo) ──────────────────
function TierBreakdown({ options, rate }: Readonly<{
  options: AdminProductOptionPreview[];
  rate: number | null;
}>) {
  if (!options.length) {
    return <p className="text-xs text-cream/40">Sin tiers cargados.</p>;
  }
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <TierRow key={o.id} o={o} rate={rate} />
      ))}
    </div>
  );
}

function TierRow({ o, rate }: Readonly<{ o: AdminProductOptionPreview; rate: number | null }>) {
  const pubArs = o.price_adult_usd != null && rate ? o.price_adult_usd * rate : null;
  const netUsd = netAdultUsd(o, rate);
  const margin = o.price_adult_usd != null && netUsd != null ? o.price_adult_usd - netUsd : null;
  const pct = margin != null && o.price_adult_usd ? Math.round((margin / o.price_adult_usd) * 100) : null;

  const netDisplay = o.net_price_currency === 'ARS'
    ? ars(o.net_price_adult_ars)
    : usd(o.net_price_adult_usd);
  const netChild = o.net_price_currency === 'ARS'
    ? ars(o.net_price_child_ars)
    : usd(o.net_price_child_usd);

  return (
    <div className="rounded-md border border-gold/10 bg-ink/40 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-cream">
          {o.name_es} <span className="text-cream/35 font-normal">· {o.code}</span>
        </span>
        {!o.is_active && <span className="text-[10px] text-cream/30 shrink-0">oculto</span>}
      </div>
      <div className="mt-1.5 grid gap-x-5 gap-y-1 sm:grid-cols-2 text-[11px] leading-snug">
        <div>
          <span className="text-cream/45">Público: </span>
          <span className="text-gold font-medium">{usd(o.price_adult_usd) ?? '—'}</span>
          {pubArs != null && <span className="text-cream/40"> · {ars(pubArs)}</span>}
          {o.price_child_usd != null && (
            <span className="text-cream/40"> · niño {usd(o.price_child_usd)}</span>
          )}
        </div>
        <div>
          <span className="text-cream/45">Neto: </span>
          <span className="text-cream/85 font-medium">{netDisplay ?? '—'}</span>
          {netChild && <span className="text-cream/40"> · niño {netChild}</span>}
        </div>
        <div>
          <span className="text-cream/45">Margen: </span>
          {margin != null ? (
            <span className={`font-medium ${margin >= 0 ? 'text-emerald-400' : 'text-bordeaux-light'}`}>
              {usd(margin)}{pct != null && ` (${pct}%)`}
            </span>
          ) : (
            <span className="text-cream/30">sin neto</span>
          )}
        </div>
        <div className="text-cream/55">
          Cupo {o.default_capacity_per_day}/día
          {o.has_transfer && (
            <span> · Traslado {usd(o.transfer_price_usd) ?? '—'}
              {o.net_transfer_price_usd != null && (
                <span className="text-cream/35"> (neto {usd(o.net_transfer_price_usd)})</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleButton({ p, toggling, onToggle }: Readonly<{
  p: AdminProductSummary;
  toggling: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={toggling}
      title={p.is_active ? 'Ocultar servicio' : 'Mostrar servicio'}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all
        ${toggling ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:opacity-80'}
        ${p.is_active
          ? 'bg-gold/15 text-gold border border-gold/30'
          : 'bg-ink-soft/60 text-cream/40 border border-white/10'
        }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-gold' : 'bg-cream/30'}`} />
      {toggling ? '…' : p.is_active ? 'Visible' : 'Oculto'}
    </button>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function ProductCard({ p, toggling, onToggle, expanded, onToggleExpand, rate, highlighted, cardRef, onNavigate }: Readonly<{
  p: AdminProductSummary;
  toggling: boolean;
  onToggle: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  rate: number | null;
  highlighted?: boolean;
  cardRef?: (node: HTMLElement | null) => void;
  onNavigate: () => void;
}>) {
  return (
    <div
      ref={cardRef}
      className={`rounded-xl border transition duration-500 overflow-hidden ${
        highlighted ? 'border-gold bg-gold/10 shadow-[inset_0_0_0_1.5px_rgba(200,168,90,0.55)]' : 'border-gold/10 bg-ink-soft/40 hover:bg-ink-soft/60'
      }`}
    >
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        {/* Thumbnail hero */}
        <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-ink-soft/60 border border-gold/10">
          {p.hero_image_url
            ? <img src={p.hero_image_url} alt="" className="w-full h-full object-cover" />
            : <span className="w-full h-full flex items-center justify-center text-cream/20 text-lg">◈</span>}
        </div>
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/admin/products/${p.id}`} onClick={onNavigate} className="text-cream hover:text-gold font-medium text-sm leading-tight">
              {p.name}
            </Link>
            <p className="text-xs text-cream/40 truncate mt-0.5">{p.venue_name}</p>
          </div>
          <p className="text-gold-soft font-mono text-xs whitespace-nowrap shrink-0 mt-0.5">
            {p.starting_price_usd != null ? `USD ${p.starting_price_usd}` : '—'}
          </p>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-cream/50 truncate">
            {p.category_name_es}
            {' · '}
            {p.options_count} opcion{p.options_count === '1' ? '' : 'es'}
            {' · '}
            {p.images_count} img{p.images_count === '1' ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ToggleButton p={p} toggling={toggling} onToggle={onToggle} />
          <Link to={`/admin/products/${p.id}`} onClick={onNavigate} className="text-xs text-gold-soft hover:text-gold transition">
            Editar →
          </Link>
        </div>
      </div>

      {p.options.length > 0 && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full px-4 py-2 border-t border-gold/10 text-left text-xs text-gold-soft hover:text-gold hover:bg-gold/5 transition"
        >
          {expanded ? '▾ Ocultar precios' : `▸ Ver precios (${p.options.length} tier${p.options.length === 1 ? '' : 's'})`}
        </button>
      )}
      {expanded && (
        <div className="px-4 pb-3 pt-1">
          <TierBreakdown options={p.options} rate={rate} />
        </div>
      )}
    </div>
  );
}

export default function ProductsList() {
  const [products, setProducts] = useState<AdminProductSummary[] | null>(null);
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const rate = useExchangeRate();
  const { isHighlighted, highlightedRef, markVisited } = useReturnHighlight(
    LAST_VIEWED_KEY, products, (p: AdminProductSummary) => p.id,
  );

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    adminApi.products.list()
      .then(setProducts)
      .catch((err) => setError((err as Error).message));
  }, []);

  const handleToggleVisibility = async (p: AdminProductSummary) => {
    if (toggling.has(p.id)) return;
    setToggling((prev) => new Set(prev).add(p.id));
    try {
      await adminApi.products.update(p.id, { is_active: !p.is_active });
      setProducts((prev) =>
        prev ? prev.map((x) => x.id === p.id ? { ...x, is_active: !p.is_active } : x) : prev,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(p.id); return next; });
    }
  };

  const filtered = useMemo(() => {
    if (!products) return null;
    return products.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return p.name.toLowerCase().includes(q)
        || p.venue_name.toLowerCase().includes(q)
        || p.slug.toLowerCase().includes(q);
    });
  }, [products, filter, showInactive]);

  let mainContent: React.ReactNode;
  if (!filtered && !error) {
    mainContent = (
      <div className="space-y-3">
        {SKELETON_KEYS.map((k) => (
          <div key={k} className="h-[72px] rounded-xl bg-ink-soft/60 animate-pulse" />
        ))}
      </div>
    );
  } else if (filtered && filtered.length === 0) {
    mainContent = (
      <p className="text-cream/60 text-sm">
        {products && products.length === 0 ? 'Todavía no hay productos. Creá el primero.' : 'No hay resultados.'}
      </p>
    );
  } else if (filtered && filtered.length > 0) {
    mainContent = (
      <>
        {/* ── Mobile: cards ── */}
        <div className="md:hidden space-y-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              toggling={toggling.has(p.id)}
              onToggle={() => handleToggleVisibility(p)}
              expanded={expanded.has(p.id)}
              onToggleExpand={() => toggleExpand(p.id)}
              rate={rate}
              highlighted={isHighlighted(p.id)}
              cardRef={isHighlighted(p.id) ? highlightedRef : undefined}
              onNavigate={() => markVisited(p.id)}
            />
          ))}
        </div>

        {/* ── Desktop: tabla ── */}
        <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 w-10" />
                <th className="text-left py-2.5 px-3">Producto</th>
                <th className="text-left py-2.5 px-3">Categoría</th>
                <th className="text-center py-2.5 px-3">Tiers</th>
                <th className="text-center py-2.5 px-3">Imgs</th>
                <th className="text-right py-2.5 px-3">Desde</th>
                <th className="text-center py-2.5 px-3">Estado</th>
                <th className="text-right py-2.5 px-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <Fragment key={p.id}>
                  <tr
                    ref={isHighlighted(p.id) ? highlightedRef : undefined}
                    className={`border-t transition duration-500 ${
                      isHighlighted(p.id)
                        ? 'bg-gold/10 shadow-[inset_0_0_0_1.5px_rgba(200,168,90,0.55)]'
                        : 'border-gold/5 hover:bg-gold/5 hover:shadow-[inset_0_0_0_1px_rgba(200,168,90,0.35)]'
                    }`}
                  >
                    <td className="py-2 px-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-ink-soft/60 border border-gold/10 shrink-0">
                        {p.hero_image_url
                          ? <img src={p.hero_image_url} alt="" className="w-full h-full object-cover" />
                          : <span className="w-full h-full flex items-center justify-center text-cream/20 text-sm">◈</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <Link to={`/admin/products/${p.id}`} onClick={() => markVisited(p.id)} className="text-cream hover:text-gold text-xs font-medium leading-tight">
                        {p.name}
                      </Link>
                      <p className="text-xs text-cream/40 truncate max-w-[160px]">{p.venue_name}</p>
                    </td>
                    <td className="py-2.5 px-3 text-cream/70 text-xs">{p.category_name_es}</td>
                    <td className="py-2.5 px-3 text-center text-cream/70 text-xs">
                      {p.options.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(p.id)}
                          className="text-gold-soft hover:text-gold transition tabular-nums"
                          title={expanded.has(p.id) ? 'Ocultar precios' : 'Ver precios de los tiers'}
                        >
                          {expanded.has(p.id) ? '▾' : '▸'} {p.options_count}
                        </button>
                      ) : p.options_count}
                    </td>
                    <td className="py-2.5 px-3 text-center text-cream/70 text-xs">{p.images_count}</td>
                    <td className="py-2.5 px-3 text-right text-cream/70 tabular-nums text-xs whitespace-nowrap">
                      {p.starting_price_usd != null ? `USD ${p.starting_price_usd}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <ToggleButton p={p} toggling={toggling.has(p.id)} onToggle={() => handleToggleVisibility(p)} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Link to={`/admin/products/${p.id}`} onClick={() => markVisited(p.id)} className="text-gold-soft hover:text-gold text-xs">Editar →</Link>
                    </td>
                  </tr>
                  {expanded.has(p.id) && p.options.length > 0 && (
                    <tr className="bg-ink/30">
                      <td colSpan={8} className="px-3 pb-3 pt-1">
                        <TierBreakdown options={p.options} rate={rate} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-cream/30 text-right">
          {filtered.length} producto{filtered.length === 1 ? '' : 's'}
        </p>
      </>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4 md:mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Catálogo</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Productos</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <Link to="/admin/products/bulk-capacity" className="btn-ghost text-sm">Cupos</Link>
          <Link to="/admin/products/new" className="btn-primary text-sm">+ Nuevo</Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          type="search" placeholder="Buscar por nombre, venue o slug..."
          value={filter} onChange={(e) => setFilter(e.target.value)}
          className="input max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-cream/70">
          <Checkbox checked={showInactive} onChange={setShowInactive} />
          Mostrar inactivos
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {mainContent}
    </div>
  );
}
