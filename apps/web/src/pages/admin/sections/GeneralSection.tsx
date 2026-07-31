import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminCategory, type AdminProductDetail } from '../../../lib/adminApi';
import Checkbox from '../../../components/Checkbox';

interface Props {
  product: AdminProductDetail | null;
  categories: AdminCategory[];
  isNew: boolean;
  onCreated: (p: AdminProductDetail) => void;
  onUpdated: (p: AdminProductDetail) => void;
  onDelete?: () => void;
  onHardDelete?: () => void;
}

const empty = {
  slug: '', name: '', venue_name: '', category_id: 0,
  short_description_es: '', short_description_en: '',
  long_description_es: '', long_description_en: '',
  address_es: '', address_en: '',
  neighborhood_es: '', tagline_es: '', badge_es: '',
  schedule_summary_es: '', schedule_summary_en: '',
  video_url: '',
  starting_price_usd: null as number | null,
  is_active: true, display_order: 0,
  available_days: [1, 2, 3, 4, 5, 6, 7] as number[],
};

const DAYS = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 7, label: 'Dom' },
];

export default function GeneralSection({ product, categories, isNew, onCreated, onUpdated, onDelete, onHardDelete }: Props) {
  const [form, setForm] = useState(() => product ? { ...empty, ...product } : { ...empty });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (product) {
      setForm({ ...empty, ...product });
      setDirty(false);
    }
  }, [product]);

  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const toggleDay = (day: number) => {
    const current = form.available_days ?? [];
    update('available_days', current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort());
  };

  const slugify = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
     .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        category_id: Number(form.category_id),
        starting_price_usd: form.starting_price_usd != null ? Number(form.starting_price_usd) : null,
      };
      if (isNew) {
        const created = await adminApi.products.create(payload);
        onCreated(created);
      } else if (product) {
        const updated = await adminApi.products.update(product.id, payload);
        onUpdated(updated);
        setDirty(false);
      }
    } catch (err) {
      const e2 = err as AdminApiError;
      setError(e2.message + (e2.details ? `\n${JSON.stringify(e2.details, null, 2)}` : ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <pre className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-xs text-cream/90 whitespace-pre-wrap">
          {error}
        </pre>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nombre" required>
          <input
            type="text" required maxLength={160}
            value={form.name}
            onChange={(e) => {
              update('name', e.target.value);
              if (isNew && !form.slug) update('slug', slugify(e.target.value));
            }}
            className="input"
          />
        </Field>
        <Field label="Venue / casa" required>
          <input
            type="text" required maxLength={160}
            value={form.venue_name}
            onChange={(e) => update('venue_name', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Slug (URL)" required hint="Solo letras minúsculas, números y guiones">
          <input
            type="text" required maxLength={80} pattern="[a-z0-9-]{2,80}"
            value={form.slug}
            onChange={(e) => update('slug', e.target.value)}
            className="input font-mono text-sm"
            disabled={!isNew}
          />
        </Field>
        <Field label="Categoría" required>
          <select
            required
            value={form.category_id || ''}
            onChange={(e) => update('category_id', Number(e.target.value))}
            className="input"
          >
            <option value="" disabled>Seleccionar...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name_es}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Frase destacada (ES)" hint="Frase corta editorial que aparece arriba del título en la card, ej: 'Catedral del Tango'. Si la dejás vacía, se muestra el nombre del venue.">
        <input
          type="text" maxLength={120}
          value={form.tagline_es ?? ''}
          onChange={(e) => update('tagline_es', e.target.value)}
          className="input"
          placeholder="Ej: Catedral del Tango"
        />
      </Field>

      <Field label="Etiqueta destacada" hint="Texto corto y reutilizable para resaltar esta casa en su card del listado, ej: '¡Últimos lugares!', 'Recomendado'. Dejala vacía para no mostrar nada — la vas cambiando o sacando cuando quieras destacar otra casa.">
        <input
          type="text" maxLength={40}
          value={form.badge_es ?? ''}
          onChange={(e) => update('badge_es', e.target.value)}
          className="input"
          placeholder="Ej: ¡Últimos lugares!"
        />
      </Field>

      <Field label="Descripción corta (ES)" hint="Aparece en las cards del listado — el sitio traduce automáticamente al resto de los idiomas">
        <textarea
          rows={3} maxLength={500}
          value={form.short_description_es ?? ''}
          onChange={(e) => update('short_description_es', e.target.value)}
          className="input"
        />
      </Field>

      <Field label="Descripción larga (ES)" hint="En la página de detalle">
        <textarea
          rows={6} maxLength={4000}
          value={form.long_description_es ?? ''}
          onChange={(e) => update('long_description_es', e.target.value)}
          className="input"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Dirección" hint="Se muestra en el detalle público y en el voucher del pasajero">
          <input
            type="text" maxLength={300}
            value={form.address_es ?? ''}
            onChange={(e) => update('address_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Barrio" hint="Ubicación corta para el pin sobre la foto en la card, ej: 'Barracas'">
          <input
            type="text" maxLength={80}
            value={form.neighborhood_es ?? ''}
            onChange={(e) => update('neighborhood_es', e.target.value)}
            className="input"
            placeholder="Ej: Barracas"
          />
        </Field>
      </div>

      <Field label="Resumen de horarios" hint="Texto libre — ej: 'Lun a Dom, traslado 19:30-20:00...'">
        <textarea
          rows={3} maxLength={800}
          value={form.schedule_summary_es ?? ''}
          onChange={(e) => update('schedule_summary_es', e.target.value)}
          className="input"
        />
      </Field>

      <Field label="Video (YouTube)" hint="Pegá el link del video de YouTube de esta casa — se muestra en el detalle público">
        <input
          type="url" maxLength={500}
          value={form.video_url ?? ''}
          onChange={(e) => update('video_url', e.target.value)}
          className="input"
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </Field>

      <Field label="Días de operación (toda la casa)" hint="Días en que la casa opera — se combina con los días propios de cada tier (pestaña Tiers/Opciones): si un día no está tildado acá, esa casa no opera ese día en ningún tier">
        <div className="flex gap-2 flex-wrap">
          {DAYS.map((d) => {
            const active = (form.available_days ?? []).includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`px-3 py-1.5 rounded-md text-sm transition ${
                  active
                    ? 'bg-gold text-ink border border-gold'
                    : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Precio mínimo (USD)" hint="Auto-calculado desde los tiers. Editable.">
          <input
            type="number" min={0} step={0.01}
            value={form.starting_price_usd ?? ''}
            onChange={(e) => update('starting_price_usd', e.target.value ? Number(e.target.value) : null)}
            className="input"
          />
        </Field>
        <Field label="Orden de display" hint="Menor número aparece primero en el listado público">
          <input
            type="number"
            value={form.display_order}
            onChange={(e) => update('display_order', Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field label="Estado">
          <label className="flex items-center gap-2 py-2">
            <Checkbox
              checked={form.is_active}
              onChange={(checked) => update('is_active', checked)}
            />
            <span className="text-cream/80">{form.is_active ? 'Activo (visible)' : 'Inactivo (oculto)'}</span>
          </label>
        </Field>
      </div>


      <div className="flex items-center justify-between pt-4 border-t border-gold/10">
        <div className="flex items-center gap-4">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-sm text-bordeaux-light hover:text-bordeaux-light/80"
            >
              Desactivar producto
            </button>
          )}
          {onHardDelete && (
            <button
              type="button"
              onClick={onHardDelete}
              className="text-sm text-red-500 hover:text-red-400"
            >
              Eliminar definitivamente
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dirty && !isNew && <span className="text-xs text-gold-soft">Cambios sin guardar</span>}
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : isNew ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-cream/80 mb-1.5">
        {label} {required && <span className="text-gold">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1 text-xs text-cream/40">{hint}</p>}
    </label>
  );
}
