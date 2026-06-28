import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminOption } from '../../../lib/adminApi';
import { LoadingBlock } from '../../../components/Spinner';

interface AvailabilityEntry {
  id: number;
  date: string;
  capacity_override: number | null;
  is_closed: boolean;
  notes: string | null;
}

interface Props {
  option: AdminOption;
  onClose: () => void;
}

const today = new Date().toISOString().slice(0, 10);

export default function AvailabilityEditor({ option, onClose }: Props) {
  const [entries, setEntries] = useState<AvailabilityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newDate, setNewDate] = useState(today);
  const [newCapacity, setNewCapacity] = useState<string>('');
  const [newClosed, setNewClosed] = useState(true);
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await adminApi.options.availability.list(option.id);
      setEntries(data);
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id]);

  const handleAdd = async () => {
    setSaving(true);
    try {
      await adminApi.options.availability.upsert(option.id, {
        date: newDate,
        capacity_override: newClosed ? null : (newCapacity ? Number(newCapacity) : null),
        is_closed: newClosed,
        notes: newNotes.trim() || null,
      });
      setNewCapacity('');
      setNewClosed(true);
      setNewNotes('');
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este override?')) return;
    try {
      await adminApi.options.availability.delete(id);
      await load();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  const upcomingClosed = entries?.filter((e) => e.is_closed && e.date >= today) ?? [];
  const upcomingCapacity = entries?.filter((e) => !e.is_closed && e.date >= today) ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm overflow-y-auto p-4 flex items-start justify-center">
      <div className="bg-ink-soft border border-gold/20 rounded-2xl w-full max-w-3xl my-8">
        <header className="p-6 border-b border-gold/10 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Disponibilidad por fecha</p>
            <h2 className="mt-1 font-display text-2xl text-cream">{option.name_es}</h2>
            <p className="mt-1 text-xs text-cream/50">
              Cupo por defecto: <span className="text-cream">{option.default_capacity_per_day}</span> personas por día.
              Los overrides acá se aplican a fechas puntuales y el checkout las valida al momento de reservar.
            </p>
            {entries !== null && (
              <div className="mt-2 flex gap-3">
                {upcomingClosed.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs rounded-full bg-bordeaux-deep/30 border border-bordeaux-light/30 px-2 py-0.5 text-bordeaux-light">
                    {upcomingClosed.length} fecha{upcomingClosed.length !== 1 ? 's' : ''} cerrada{upcomingClosed.length !== 1 ? 's' : ''} próxima{upcomingClosed.length !== 1 ? 's' : ''}
                  </span>
                )}
                {upcomingCapacity.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs rounded-full bg-gold/10 border border-gold/20 px-2 py-0.5 text-gold-soft">
                    {upcomingCapacity.length} cupo{upcomingCapacity.length !== 1 ? 's' : ''} personalizado{upcomingCapacity.length !== 1 ? 's' : ''}
                  </span>
                )}
                {upcomingClosed.length === 0 && upcomingCapacity.length === 0 && entries.length === 0 && (
                  <span className="text-xs text-cream/30">Sin overrides</span>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 h-9 w-9 rounded-full bg-ink/60 hover:bg-ink text-cream"
          >×</button>
        </header>

        {/* Formulario nueva fecha */}
        <div className="p-6 border-b border-gold/10 bg-gold/5">
          <h3 className="text-sm uppercase tracking-wider text-gold mb-4">+ Agregar fecha especial</h3>

          {/* Tipo de override */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setNewClosed(true)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                newClosed
                  ? 'border-bordeaux-light bg-bordeaux-deep/20 text-bordeaux-light'
                  : 'border-gold/20 text-cream/50 hover:border-gold/40'
              }`}
            >
              <span className="font-medium">Cerrar fecha</span>
              <span className="block text-xs opacity-70">Sin reservas ese día</span>
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
              <span className="block text-xs opacity-70">Cupo diferente al default</span>
            </button>
          </div>

          <div className="grid sm:grid-cols-[160px_1fr_auto] gap-3 items-end">
            <label className="block">
              <span className="block text-xs text-cream/60 mb-1">Fecha</span>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input" />
            </label>
            {!newClosed ? (
              <label className="block">
                <span className="block text-xs text-cream/60 mb-1">Cupo para ese día</span>
                <input
                  type="number" min={0}
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  placeholder={`${option.default_capacity_per_day} (default)`}
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
                  placeholder="Ej: Feriado nacional, mantenimiento, reserva privada..."
                  className="input"
                />
              </label>
            )}
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
          {!newClosed && (
            <div className="mt-2">
              <label className="block">
                <span className="block text-xs text-cream/60 mb-1">Motivo (interno)</span>
                <input
                  type="text" maxLength={300}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Opcional: San Valentín, evento especial..."
                  className="input"
                />
              </label>
            </div>
          )}
        </div>

        {/* Lista de overrides */}
        <div className="p-6">
          {error && <p className="text-sm text-bordeaux-light mb-4">{error}</p>}
          {!entries && <LoadingBlock label="Cargando..." />}
          {entries && entries.length === 0 && (
            <p className="text-sm text-cream/40 py-4 text-center">
              No hay fechas especiales configuradas. Todas usan el cupo por defecto ({option.default_capacity_per_day}).
            </p>
          )}
          {entries && entries.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-cream/40">
                <tr>
                  <th className="text-left pb-3">Fecha</th>
                  <th className="text-left pb-3">Estado</th>
                  <th className="text-left pb-3">Nota</th>
                  <th className="text-right pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const isPast = e.date < today;
                  return (
                    <tr key={e.id} className={`border-t border-gold/5 ${isPast ? 'opacity-40' : ''}`}>
                      <td className="py-2.5 font-mono tabular-nums text-cream text-xs">
                        {e.date}
                        {isPast && <span className="ml-1.5 text-cream/40 text-[10px]">(pasada)</span>}
                      </td>
                      <td className="py-2.5">
                        {e.is_closed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-bordeaux-deep/30 border border-bordeaux-light/30 px-2 py-0.5 text-xs text-bordeaux-light">
                            ✕ Cerrada
                          </span>
                        ) : e.capacity_override != null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 border border-gold/20 px-2 py-0.5 text-xs text-gold">
                            Cupo: {e.capacity_override}
                          </span>
                        ) : (
                          <span className="text-cream/30 text-xs">Default</span>
                        )}
                      </td>
                      <td className="py-2.5 text-cream/60 text-xs">{e.notes ?? '—'}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="text-xs text-cream/30 hover:text-bordeaux-light transition-colors"
                        >
                          Eliminar
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
    </div>
  );
}
