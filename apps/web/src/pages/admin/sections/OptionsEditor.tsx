import { useState } from 'react';
import { adminApi, AdminApiError, type AdminOption, type AdminProductDetail } from '../../../lib/adminApi';
import AvailabilityEditor from './AvailabilityEditor';

interface Props {
  product: AdminProductDetail;
  onChange: (p: AdminProductDetail) => void;
}

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

const blankOption: Partial<AdminOption> = {
  code: '', name_es: '', name_en: '',
  description_es: '', description_en: '',
  includes_es: [], includes_en: [],
  price_adult_usd: 0, price_child_usd: null,
  has_dinner: false, has_transfer: false, transfer_price_usd: 0,
  available_days: [1, 2, 3, 4, 5, 6, 7],
  pickup_window_es: '', pickup_window_en: '',
  dinner_time_es: '', dinner_time_en: '',
  show_time_es: '', show_time_en: '',
  default_capacity_per_day: 15,
  display_order: 0, is_active: true,
};

export default function OptionsEditor({ product, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<number | 'new' | null>(null);
  const [draftNew, setDraftNew] = useState<Partial<AdminOption>>(blankOption);
  const [availabilityFor, setAvailabilityFor] = useState<AdminOption | null>(null);
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  const refresh = async () => {
    const updated = await adminApi.products.get(product.id);
    onChange(updated);
  };

  const handleToggleOption = async (opt: AdminOption) => {
    if (toggling.has(opt.id)) return;
    setToggling((prev) => new Set(prev).add(opt.id));
    try {
      await adminApi.products.options.update(opt.id, { is_active: !opt.is_active });
      await refresh();
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(opt.id); return next; });
    }
  };

  const handleSaveExisting = async (opt: AdminOption, changes: Partial<AdminOption>) => {
    try {
      const payload: Partial<AdminOption> = {
        ...changes,
        price_adult_usd: Number(changes.price_adult_usd ?? 0),
        price_child_usd: changes.price_child_usd != null && changes.price_child_usd !== ('' as unknown)
          ? Number(changes.price_child_usd) : null,
        default_capacity_per_day: changes.default_capacity_per_day != null ? Number(changes.default_capacity_per_day) : undefined,
        low_availability_threshold: changes.low_availability_threshold != null ? Number(changes.low_availability_threshold) : undefined,
        display_order: changes.display_order != null ? Number(changes.display_order) : undefined,
      };
      await adminApi.products.options.update(opt.id, payload);
      await refresh();
      setExpandedId(null);
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  const handleCreate = async () => {
    try {
      const payload = {
        ...draftNew,
        price_adult_usd: Number(draftNew.price_adult_usd ?? 0),
        price_child_usd: draftNew.price_child_usd != null && draftNew.price_child_usd !== ''
          ? Number(draftNew.price_child_usd) : null,
      };
      await adminApi.products.options.create(product.id, payload);
      setDraftNew(blankOption);
      setExpandedId(null);
      await refresh();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  const handleDelete = async (opt: AdminOption) => {
    if (!confirm(`¿Eliminar el tier "${opt.name_es}"?`)) return;
    try {
      await adminApi.products.options.delete(opt.id);
      await refresh();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cream/60">
          {product.options.length} tier{product.options.length !== 1 ? 's' : ''} configurado{product.options.length !== 1 ? 's' : ''}.
          Cada tier define su propio precio, días, horarios y cupo.
        </p>
        <button
          type="button"
          onClick={() => setExpandedId(expandedId === 'new' ? null : 'new')}
          className="btn-ghost text-sm"
        >
          {expandedId === 'new' ? 'Cancelar' : '+ Nuevo tier'}
        </button>
      </div>

      {expandedId === 'new' && (
        <div className="rounded-lg border border-gold/30 bg-gold/5 p-5">
          <h3 className="font-display text-lg text-cream mb-4">Nuevo tier</h3>
          <OptionFormFields option={draftNew} onChange={setDraftNew} />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setExpandedId(null)} className="btn-ghost text-sm">Cancelar</button>
            <button type="button" onClick={handleCreate} className="btn-primary text-sm">Crear tier</button>
          </div>
        </div>
      )}

      {product.options.map((opt) => (
        <OptionRow
          key={opt.id}
          option={opt}
          expanded={expandedId === opt.id}
          onToggle={() => setExpandedId(expandedId === opt.id ? null : opt.id)}
          onSave={(changes) => handleSaveExisting(opt, changes)}
          onDelete={() => handleDelete(opt)}
          onManageAvailability={() => setAvailabilityFor(opt)}
          onToggleVisibility={() => handleToggleOption(opt)}
          isToggling={toggling.has(opt.id)}
        />
      ))}

      {availabilityFor && (
        <AvailabilityEditor
          option={availabilityFor}
          onClose={() => setAvailabilityFor(null)}
        />
      )}
    </div>
  );
}

function OptionRow({ option, expanded, onToggle, onSave, onDelete, onManageAvailability, onToggleVisibility, isToggling }: {
  option: AdminOption;
  expanded: boolean;
  onToggle: () => void;
  onSave: (changes: Partial<AdminOption>) => void;
  onDelete: () => void;
  onManageAvailability: () => void;
  onToggleVisibility: () => void;
  isToggling: boolean;
}) {
  const [draft, setDraft] = useState<Partial<AdminOption>>(option);

  return (
    <div className={`rounded-lg border overflow-hidden transition ${option.is_active ? 'border-gold/10 bg-ink-soft/40' : 'border-white/5 bg-ink-soft/20 opacity-70'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gold/5 transition text-left"
      >
        <div className="flex items-center gap-4">
          <span className="text-xs text-cream/40 font-mono">#{option.display_order}</span>
          <div>
            <p className={`font-medium ${option.is_active ? 'text-cream' : 'text-cream/50'}`}>{option.name_es}</p>
            <p className="text-xs text-cream/50">{option.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gold">USD {option.price_adult_usd}</span>
          <span className="text-cream/50">Cupo: {option.default_capacity_per_day}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
            disabled={isToggling}
            title={option.is_active ? 'Ocultar tier' : 'Mostrar tier'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all
              ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:opacity-80'}
              ${option.is_active
                ? 'bg-gold/15 text-gold border border-gold/30'
                : 'bg-ink-soft/60 text-cream/40 border border-white/10'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${option.is_active ? 'bg-gold' : 'bg-cream/30'}`} />
            {isToggling ? '...' : option.is_active ? 'Visible' : 'Oculto'}
          </button>
          <span className="text-cream/40">{expanded ? '▴' : '▾'}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-5 border-t border-gold/10">
          <OptionFormFields option={draft} onChange={setDraft} />
          <div className="mt-5 flex items-center justify-between">
            <div className="flex gap-2">
              <button type="button" onClick={onManageAvailability} className="btn-ghost text-sm">
                📅 Cupos por fecha
              </button>
              <button type="button" onClick={onDelete} className="text-sm text-bordeaux-light hover:text-bordeaux-light/80 px-3">
                Eliminar
              </button>
            </div>
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="btn-primary text-sm"
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionFormFields({ option, onChange }: {
  option: Partial<AdminOption>;
  onChange: (next: Partial<AdminOption>) => void;
}) {
  const update = <K extends keyof AdminOption>(key: K, value: AdminOption[K] | null | string | string[] | number | boolean) =>
    onChange({ ...option, [key]: value });

  const toggleDay = (day: number) => {
    const current = (option.available_days ?? []) as number[];
    update('available_days', current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort());
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Código interno" required hint="Ej: cena-show-vip, solo-show-promo">
          <input
            type="text" required maxLength={50} pattern="[a-z0-9-]{2,50}"
            value={option.code ?? ''} onChange={(e) => update('code', e.target.value)}
            className="input font-mono text-sm"
          />
        </Field>
        <Field label="Nombre (ES)" required>
          <input
            type="text" required maxLength={160}
            value={option.name_es ?? ''} onChange={(e) => update('name_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Nombre (EN)" required>
          <input
            type="text" required maxLength={160}
            value={option.name_en ?? ''} onChange={(e) => update('name_en', e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Descripción (ES)">
          <textarea
            rows={2} maxLength={500}
            value={option.description_es ?? ''} onChange={(e) => update('description_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Descripción (EN)">
          <textarea
            rows={2} maxLength={500}
            value={option.description_en ?? ''} onChange={(e) => update('description_en', e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Incluye (ES)" hint="Una línea por ítem">
          <textarea
            rows={5}
            value={(option.includes_es ?? []).join('\n')}
            onChange={(e) => update('includes_es', e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
            className="input"
            placeholder="Mesa preferencial&#10;Menú a la carta&#10;Bebidas libres"
          />
        </Field>
        <Field label="Incluye (EN)" hint="Una línea por ítem">
          <textarea
            rows={5}
            value={(option.includes_en ?? []).join('\n')}
            onChange={(e) => update('includes_en', e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
            className="input"
            placeholder="Preferential table&#10;À la carte menu&#10;Free drinks"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Precio adulto (USD)" required>
          <input
            type="number" required min={0} step={0.01}
            value={option.price_adult_usd ?? ''} onChange={(e) => update('price_adult_usd', Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field label="Precio menor (USD)" hint="Dejar vacío si no admite menores">
          <input
            type="number" min={0} step={0.01}
            value={option.price_child_usd ?? ''}
            onChange={(e) => update('price_child_usd', e.target.value ? Number(e.target.value) : null)}
            className="input"
          />
        </Field>
        <Field label="Cupo por defecto" required hint="Personas máximas por noche (sin override)">
          <input
            type="number" required min={0} step={1}
            value={option.default_capacity_per_day ?? 80}
            onChange={(e) => update('default_capacity_per_day', Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>

      <Field label="Días de operación">
        <div className="flex gap-2 flex-wrap">
          {DAYS.map((d) => {
            const active = (option.available_days ?? []).includes(d.value);
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

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Ventana de traslado (ES)" hint="Ej: 'Entre 19:30 y 20:00'">
          <input
            type="text" maxLength={200}
            value={option.pickup_window_es ?? ''} onChange={(e) => update('pickup_window_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Ventana de traslado (EN)">
          <input
            type="text" maxLength={200}
            value={option.pickup_window_en ?? ''} onChange={(e) => update('pickup_window_en', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Horario cena (ES)" hint="Ej: 'Cena desde 20:00'">
          <input
            type="text" maxLength={200}
            value={option.dinner_time_es ?? ''} onChange={(e) => update('dinner_time_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Horario cena (EN)">
          <input
            type="text" maxLength={200}
            value={option.dinner_time_en ?? ''} onChange={(e) => update('dinner_time_en', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Horario show (ES)" hint="Ej: 'Show desde 22:00'">
          <input
            type="text" maxLength={200}
            value={option.show_time_es ?? ''} onChange={(e) => update('show_time_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Horario show (EN)">
          <input
            type="text" maxLength={200}
            value={option.show_time_en ?? ''} onChange={(e) => update('show_time_en', e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={option.has_dinner ?? false}
            onChange={(e) => update('has_dinner', e.target.checked)}
            className="accent-gold"
          />
          <span className="text-sm text-cream/80">Incluye cena</span>
        </label>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={option.has_transfer ?? false}
              onChange={(e) => update('has_transfer', e.target.checked)}
              className="accent-gold"
            />
            <span className="text-sm text-cream/80">Incluye traslado</span>
          </label>
          {option.has_transfer && (
            <label className="block">
              <span className="block text-xs text-cream/60 mb-1">Precio traslado (USD/pax)</span>
              <input
                type="number" min={0} step={0.01}
                value={option.transfer_price_usd ?? 0}
                onChange={(e) => update('transfer_price_usd', Number(e.target.value))}
                className="input w-28 text-sm"
              />
            </label>
          )}
        </div>
        <Field label="Orden display">
          <input
            type="number"
            value={option.display_order ?? 0}
            onChange={(e) => update('display_order', Number(e.target.value))}
            className="input"
          />
        </Field>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={option.is_active ?? true}
            onChange={(e) => update('is_active', e.target.checked)}
            className="accent-gold"
          />
          <span className="text-sm text-cream/80">Activo</span>
        </label>
      </div>
    </div>
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
