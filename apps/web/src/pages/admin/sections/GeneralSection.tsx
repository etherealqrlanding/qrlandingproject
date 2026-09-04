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
  dinner_show_time_es: null as string | null,
  show_only_time_es: null as string | null,
  dinner_transfer_window_es: null as string | null,
  show_only_transfer_window_es: null as string | null,
  video_url: '',
  // Se recibe del server (auto-calculado desde los tiers) y se muestra
  // read-only más abajo -- no se reenvía en el payload de guardado.
  starting_price_usd: null as number | null,
  is_active: true, display_order: 0,
  available_days: [1, 2, 3, 4, 5, 6, 7] as number[],
  children_age_label: null as string | null,
  infant_age_label: null as string | null,
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
      // starting_price_usd es read-only (lo calcula el server desde los tiers):
      // no se reenvía para no pisar el valor real con lo que había en el form.
      const { starting_price_usd: _starting_price_usd, ...formToSend } = form;
      const payload = {
        ...formToSend,
        category_id: Number(form.category_id),
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

      {/* Horarios estructurados de la casa: se cargan una sola vez acá y cada tier
          elige cuáles mostrar (con un check, en su propio editor) en vez de
          tipearlos de nuevo por tier — así todos los tiers de cena quedan siempre
          coherentes entre sí, y lo mismo para los de solo show. */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Horario show con cena" hint="Ej: 'Cena desde 20:00. Show desde 22:00.'">
          <input
            type="text" maxLength={200}
            value={form.dinner_show_time_es ?? ''}
            onChange={(e) => update('dinner_show_time_es', e.target.value || null)}
            className="input"
          />
        </Field>
        <Field label="Horario traslado a la cena" hint="Ej: 'Traslado 19:30–20:00'">
          <input
            type="text" maxLength={200}
            value={form.dinner_transfer_window_es ?? ''}
            onChange={(e) => update('dinner_transfer_window_es', e.target.value || null)}
            className="input"
          />
        </Field>
        <Field label="Horario solo show" hint="Ej: 'Show desde 22:30.'">
          <input
            type="text" maxLength={200}
            value={form.show_only_time_es ?? ''}
            onChange={(e) => update('show_only_time_es', e.target.value || null)}
            className="input"
          />
        </Field>
        <Field label="Horario traslado al solo show" hint="Ej: 'Traslado 22:00–22:30'">
          <input
            type="text" maxLength={200}
            value={form.show_only_transfer_window_es ?? ''}
            onChange={(e) => update('show_only_transfer_window_es', e.target.value || null)}
            className="input"
          />
        </Field>
      </div>

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

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Precio mínimo (USD)" hint="Se calcula solo con el tier activo más barato -- se actualiza al editar los tiers.">
          <div className="input flex items-center text-cream/70">
            {form.starting_price_usd != null ? `USD ${form.starting_price_usd}` : 'Sin tiers activos'}
          </div>
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

      {/* Todas las casas admiten menores -- lo que varía es si un tier puntual tiene
          precio de menor cargado (solapa Tiers / Opciones). Este campo siempre está
          visible para que el admin no se olvide de cargar la política de edades: antes
          había un check "Acepta menores" que, si quedaba sin marcar por error, hacía
          que la opción de menores desapareciera aunque el tier tuviera precio cargado. */}
      <Field label="Rango de edad de menores" hint='Texto libre, ej. "3 a 10 años". Se muestra junto al campo de menores en la reserva.'>
        <input
          type="text" maxLength={80}
          value={form.children_age_label ?? ''}
          onChange={(e) => update('children_age_label', e.target.value || null)}
          className="input max-w-xs"
          placeholder="3 a 10 años"
        />
      </Field>

      <Field
        label="Rango de edad de infantes"
        hint='Texto libre, ej. "0 a 2 años". Los infantes existen en todos los servicios (no depende de "Acepta menores") y nunca pagan entrada -- se muestra junto al campo de infantes en la reserva y en los emails/voucher, para que el pasajero sepa la política antes de cargar la cantidad.'
      >
        <input
          type="text" maxLength={80}
          value={form.infant_age_label ?? ''}
          onChange={(e) => update('infant_age_label', e.target.value || null)}
          className="input max-w-xs"
          placeholder="0 a 2 años"
        />
      </Field>


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
