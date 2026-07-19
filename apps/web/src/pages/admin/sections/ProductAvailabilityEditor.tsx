import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminProductDetail } from '../../../lib/adminApi';
import { LoadingBlock } from '../../../components/Spinner';

interface DateOverride {
  date: string;
  is_closed: boolean;
  capacity_override: number | null;
  notes: string | null;
}

interface Props {
  product: AdminProductDetail;
}

const today = new Date().toISOString().slice(0, 10);

export default function ProductAvailabilityEditor({ product }: Props) {
  const [overrides, setOverrides] = useState<DateOverride[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newDate, setNewDate] = useState(today);
  const [newClosed, setNewClosed] = useState(true);
  const [newCapacity, setNewCapacity] = useState<string>('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const activeCount = product.options.filter((o) => o.is_active).length;

  const load = async () => {
    try {
      setOverrides(await adminApi.products.availability.list(product.id));
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const canSave = newClosed || (newCapacity !== '' && Number(newCapacity) >= 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.products.availability.upsert(product.id, {
        date: newDate,
        is_closed: newClosed,
        capacity_override: newClosed ? null : Number(newCapacity),
        notes: newNotes.trim() || null,
      });
      setNewCapacity('');
      setNewNotes('');
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (date: string) => {
    if (!confirm(`¿Quitar el override del ${date}? Cada tier vuelve a su cupo por defecto ese día.`)) return;
    try {
      await adminApi.products.availability.clear(product.id, date);
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6">
        <p className="text-xs uppercase tracking-widest text-gold-soft">Disponibilidad de toda la casa</p>
        <p className="mt-2 text-sm text-cream/60 leading-relaxed">
          Aplica el mismo cierre o cupo puntual a los {activeCount} tier{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''} de
          esta casa para el día que elijas — ej. Navidad, Año Nuevo, o un cupo reducido por un evento especial —
          en vez de repetirlo tier por tier.
        </p>

        <div className="flex gap-2 mt-4 mb-4">
          <button
            type="button"
            onClick={() => setNewClosed(true)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              newClosed
                ? 'border-bordeaux-light bg-bordeaux-deep/20 text-bordeaux-light'
                : 'border-gold/20 text-cream/50 hover:border-gold/40'
            }`}
          >
            <span className="font-medium">Cerrar la casa</span>
            <span className="block text-xs opacity-70">Sin reservas ese día en ningún tier</span>
          </button>
          <button
            type="button"
            onClick={() => setNewClosed(false)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              !newClosed
                ? 'border-gold bg-gold/10 text-cream'
                : 'border-gold/20 text-cream/50 hover:border-gold/40'
            }`}
          >
            <span className="font-medium">Ajustar cupo</span>
            <span className="block text-xs opacity-70">Mismo cupo puntual para todos los tiers</span>
          </button>
        </div>

        <div className="grid sm:grid-cols-[160px_1fr_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-xs text-cream/60 mb-1">Fecha</span>
            <input
              type="date" value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="input"
            />
          </label>
          {!newClosed ? (
            <label className="block">
              <span className="block text-xs text-cream/60 mb-1">Cupo para ese día (todos los tiers)</span>
              <input
                type="number" min={0}
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value)}
                placeholder="Ej: 20"
                className="input"
              />
            </label>
          ) : (
            <label className="block">
              <span className="block text-xs text-cream/60 mb-1">Motivo (interno)</span>
              <input
                type="text" maxLength={300}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Ej: Navidad, Año Nuevo, cierre por mantenimiento..."
                className="input"
              />
            </label>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || activeCount === 0 || !canSave}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? '...' : 'Aplicar a toda la casa'}
          </button>
        </div>
        {!newClosed && (
          <div className="mt-3">
            <label className="block">
              <span className="block text-xs text-cream/60 mb-1">Motivo (interno)</span>
              <input
                type="text" maxLength={300}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Opcional: evento especial, baja demanda esperada..."
                className="input"
              />
            </label>
          </div>
        )}
        {activeCount === 0 && (
          <p className="mt-2 text-xs text-bordeaux-light">Esta casa no tiene tiers activos para aplicar overrides.</p>
        )}
      </div>

      <div className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6">
        <p className="text-xs uppercase tracking-widest text-gold-soft">Fechas con override (toda la casa)</p>

        {error && <p className="mt-2 text-sm text-bordeaux-light">{error}</p>}
        {!overrides && <LoadingBlock label="Cargando..." />}
        {overrides && overrides.length === 0 && (
          <p className="mt-3 text-sm text-cream/40">
            No hay fechas con un override aplicado a toda la casa. Los overrides de un tier puntual se manejan desde
            la pestaña "Tiers / Opciones".
          </p>
        )}
        {overrides && overrides.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-cream/40">
              <tr>
                <th className="text-left pb-3">Fecha</th>
                <th className="text-left pb-3">Estado</th>
                <th className="text-left pb-3">Motivo</th>
                <th className="text-right pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => {
                const isPast = o.date < today;
                return (
                  <tr key={o.date} className={`border-t border-gold/5 ${isPast ? 'opacity-40' : ''}`}>
                    <td className="py-2.5 font-mono tabular-nums text-cream text-xs">
                      {o.date}
                      {isPast && <span className="ml-1.5 text-cream/40 text-[10px]">(pasada)</span>}
                    </td>
                    <td className="py-2.5">
                      {o.is_closed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-bordeaux-deep/30 border border-bordeaux-light/30 px-2 py-0.5 text-xs text-bordeaux-light">
                          ✕ Cerrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 border border-gold/20 px-2 py-0.5 text-xs text-gold">
                          Cupo: {o.capacity_override}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-cream/60 text-xs">{o.notes ?? '—'}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleClear(o.date)}
                        className="text-xs text-cream/30 hover:text-gold transition-colors"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
