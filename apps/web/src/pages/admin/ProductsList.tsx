import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminProductSummary } from '../../lib/adminApi';

export default function ProductsList() {
  const [products, setProducts] = useState<AdminProductSummary[] | null>(null);
  const [filter, setFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<number>>(new Set());

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

  return (
    <div className="p-8 max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Catálogo</p>
          <h1 className="mt-2 font-display text-4xl text-cream">Productos</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/admin/products/bulk-capacity" className="btn-ghost text-sm">Cupos en masa</Link>
          <Link to="/admin/products/new" className="btn-primary">+ Nuevo</Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 items-center mb-6">
        <input
          type="search" placeholder="Buscar por nombre, venue o slug..."
          value={filter} onChange={(e) => setFilter(e.target.value)}
          className="input max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-cream/70">
          <input
            type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-gold"
          />
          Mostrar inactivos
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">
          {error}
        </div>
      )}

      {!filtered && !error && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-md bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div className="text-cream/60 text-sm">
          {products && products.length === 0 ? 'Todavía no hay productos. Creá el primero.' : 'No hay resultados.'}
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="rounded-lg border border-gold/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-3 px-4">Producto</th>
                <th className="text-left py-3 px-4">Categoría</th>
                <th className="text-center py-3 px-4">Tiers</th>
                <th className="text-center py-3 px-4">Imágenes</th>
                <th className="text-right py-3 px-4">Desde</th>
                <th className="text-center py-3 px-4">Estado</th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-gold/5 hover:bg-gold/5 transition">
                  <td className="py-3 px-4">
                    <Link to={`/admin/products/${p.id}`} className="text-cream hover:text-gold">
                      <span className="font-medium">{p.name}</span>
                    </Link>
                    <p className="text-xs text-cream/40">{p.venue_name} · {p.slug}</p>
                  </td>
                  <td className="py-3 px-4 text-cream/70">{p.category_name_es}</td>
                  <td className="py-3 px-4 text-center text-cream/70">{p.options_count}</td>
                  <td className="py-3 px-4 text-center text-cream/70">{p.images_count}</td>
                  <td className="py-3 px-4 text-right text-cream/70 tabular-nums">
                    {p.starting_price_usd != null ? `USD ${p.starting_price_usd}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(p)}
                      disabled={toggling.has(p.id)}
                      title={p.is_active ? 'Ocultar servicio' : 'Mostrar servicio'}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all
                        ${toggling.has(p.id) ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:opacity-80'}
                        ${p.is_active
                          ? 'bg-gold/15 text-gold border border-gold/30'
                          : 'bg-ink-soft/60 text-cream/40 border border-white/10'
                        }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-gold' : 'bg-cream/30'}`} />
                      {toggling.has(p.id) ? '...' : p.is_active ? 'Visible' : 'Oculto'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/admin/products/${p.id}`} className="text-gold-soft hover:text-gold text-sm">
                      Editar →
                    </Link>
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
