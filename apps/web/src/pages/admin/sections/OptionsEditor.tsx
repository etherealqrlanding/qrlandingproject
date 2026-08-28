import { useState } from 'react';
import { adminApi, AdminApiError, type AdminOption, type AdminProductDetail } from '../../../lib/adminApi';
import AvailabilityEditor from './AvailabilityEditor';
import Checkbox from '../../../components/Checkbox';
import IncludesEditor from '../../../components/admin/IncludesEditor';
import Collapse from '../../../components/Collapse';

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
  net_price_currency: 'USD',
  net_price_adult_usd: null, net_price_child_usd: null, net_transfer_price_usd: null,
  net_price_adult_ars: null, net_price_child_ars: null, net_transfer_price_ars: null,
  has_dinner: false, transfer_mode: 'none', transfer_price_usd: 0,
  infant_transfer_chargeable: false,
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
      const parseNetField = (v: unknown) => (v != null && v !== '') ? Number(v) : null;
      const payload: Partial<AdminOption> = {
        ...changes,
        net_price_currency: (changes.net_price_currency ?? 'USD') as 'USD' | 'ARS',
        price_adult_usd: Number(changes.price_adult_usd ?? 0),
        price_child_usd: changes.price_child_usd != null && changes.price_child_usd !== ('' as unknown)
          ? Number(changes.price_child_usd) : null,
        net_price_adult_usd: parseNetField(changes.net_price_adult_usd),
        net_price_child_usd: parseNetField(changes.net_price_child_usd),
        net_transfer_price_usd: parseNetField(changes.net_transfer_price_usd),
        net_price_adult_ars: parseNetField(changes.net_price_adult_ars),
        net_price_child_ars: parseNetField(changes.net_price_child_ars),
        net_transfer_price_ars: parseNetField(changes.net_transfer_price_ars),
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
      const parseNetField = (v: unknown) => (v != null && v !== '') ? Number(v) : null;
      const payload = {
        ...draftNew,
        net_price_currency: (draftNew.net_price_currency ?? 'USD') as 'USD' | 'ARS',
        price_adult_usd: Number(draftNew.price_adult_usd ?? 0),
        price_child_usd: draftNew.price_child_usd != null && draftNew.price_child_usd !== ''
          ? Number(draftNew.price_child_usd) : null,
        net_price_adult_usd: parseNetField(draftNew.net_price_adult_usd),
        net_price_child_usd: parseNetField(draftNew.net_price_child_usd),
        net_transfer_price_usd: parseNetField(draftNew.net_transfer_price_usd),
        net_price_adult_ars: parseNetField(draftNew.net_price_adult_ars),
        net_price_child_ars: parseNetField(draftNew.net_price_child_ars),
        net_transfer_price_ars: parseNetField(draftNew.net_transfer_price_ars),
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
        <Collapse className="rounded-lg border border-gold/30 bg-gold/5 p-5">
          <h3 className="font-display text-lg text-cream mb-4">Nuevo tier</h3>
          <OptionFormFields option={draftNew} onChange={setDraftNew} />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setExpandedId(null)} className="btn-ghost text-sm">Cancelar</button>
            <button type="button" onClick={handleCreate} className="btn-primary text-sm">Crear tier</button>
          </div>
        </Collapse>
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

  const netCur = option.net_price_currency ?? 'USD';
  const netAdult = netCur === 'USD' ? option.net_price_adult_usd : option.net_price_adult_ars;
  const netChild = netCur === 'USD' ? option.net_price_child_usd : option.net_price_child_ars;
  const fmt = (v: number | string | null | undefined) =>
    v == null || v === '' ? null : Number(v).toLocaleString('es-AR');

  return (
    <div className={`rounded-lg border overflow-hidden transition ${option.is_active ? 'border-gold/10 bg-ink-soft/40' : 'border-white/5 bg-ink-soft/20 opacity-70'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 hover:bg-gold/5 transition text-left"
      >
        {/* Fila 1: orden + nombre + flecha */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-cream/40 font-mono shrink-0">#{option.display_order}</span>
            <div className="min-w-0">
              <p className={`font-medium leading-tight ${option.is_active ? 'text-cream' : 'text-cream/50'}`}>{option.name_es}</p>
              <p className="text-xs text-cream/50 mt-0.5">{option.code}</p>
            </div>
          </div>
          <span className="text-cream/40 shrink-0 mt-0.5">{expanded ? '▴' : '▾'}</span>
        </div>
        {/* Fila 2: precio + cupo + visibilidad */}
        <div className="flex items-center gap-3 mt-2.5 flex-wrap pl-7">
          <span className="text-gold text-sm">
            Venta USD {option.price_adult_usd}
            {fmt(option.price_child_usd) && (
              <span className="text-gold/60">
                {' · menor '}{fmt(option.price_child_usd)}
              </span>
            )}
          </span>
          {fmt(netAdult) ? (
            <span className="text-cream/60 text-xs">
              Neto {netCur} {fmt(netAdult)}
              {fmt(netChild) && <span className="text-cream/40"> · menor {fmt(netChild)}</span>}
            </span>
          ) : (
            <span className="text-bordeaux-light/80 text-xs">Neto sin definir</span>
          )}
          <span className="text-cream/40 text-xs">Cupo: {option.default_capacity_per_day}</span>
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
        </div>
      </button>

      {expanded && (
        <Collapse className="p-5 border-t border-gold/10">
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
        </Collapse>
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
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Código interno" required hint="Ej: cena-show-vip, solo-show-promo">
          <input
            type="text" required maxLength={50} pattern="[a-z0-9-]{2,50}"
            value={option.code ?? ''} onChange={(e) => update('code', e.target.value)}
            className="input font-mono text-sm"
          />
        </Field>
        <Field label="Nombre" required hint="El sitio traduce automáticamente al resto de los idiomas">
          <input
            type="text" required maxLength={160}
            value={option.name_es ?? ''} onChange={(e) => update('name_es', e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <Field label="Descripción" hint="Texto corto que resume este tier en el selector de checkout">
        <textarea
          rows={2} maxLength={500}
          value={option.description_es ?? ''} onChange={(e) => update('description_es', e.target.value)}
          className="input"
        />
      </Field>

      <Field label="Incluye" hint="Un ítem por línea (Enter para el siguiente) — seleccioná texto para darle formato">
        <IncludesEditor
          key={option.id ?? 'new'}
          items={option.includes_es ?? []}
          onChange={(items) => update('includes_es', items)}
        />
      </Field>

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Precio adulto (USD)" required hint="Lo que le cobramos al pasajero (distinto del neto, más abajo)">
          <input
            type="number" required min={0} step={0.01}
            value={option.price_adult_usd ?? ''} onChange={(e) => update('price_adult_usd', Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field
          label="Precio menor (USD)"
          hint="Dejar vacío si este tier puntual no admite menores. Todas las casas aceptan menores -- lo que varía es si este tier en particular tiene un precio distinto para ellos."
        >
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

      {/* Valores netos — base para calcular comisión del vendedor */}
      <div className="rounded-lg border border-gold/15 bg-ink/30 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-gold-soft">Valores netos</p>
          <p className="text-xs text-cream/40 mt-0.5">
            Monto mínimo que el operador recibe por operación. Incentivo = precio de venta − neto (efectivo) o (precio × (1 − fee MP)) − neto (Mercado Pago).
          </p>
        </div>

        {/* Selector de moneda del neto */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-cream/60">Moneda del neto:</span>
          {(['USD', 'ARS'] as const).map((cur) => (
            <button
              key={cur}
              type="button"
              onClick={() => update('net_price_currency', cur)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                (option.net_price_currency ?? 'USD') === cur
                  ? 'bg-gold text-ink'
                  : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'
              }`}
            >
              {cur}
            </button>
          ))}
        </div>

        {(option.net_price_currency ?? 'USD') === 'USD' ? (
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Neto adulto (USD)" hint="Obligatorio para calcular el incentivo">
              <input
                type="number" min={0} step={0.01}
                value={option.net_price_adult_usd ?? ''}
                onChange={(e) => update('net_price_adult_usd', e.target.value ? Number(e.target.value) : null)}
                className="input"
                placeholder="Ej: 120"
              />
            </Field>
            <Field label="Neto menor (USD)" hint="Si vacío, usa el neto adulto">
              <input
                type="number" min={0} step={0.01}
                value={option.net_price_child_usd ?? ''}
                onChange={(e) => update('net_price_child_usd', e.target.value ? Number(e.target.value) : null)}
                className="input"
                placeholder="Ej: 80"
              />
            </Field>
            <Field label="Neto traslado (USD/pax)" hint="Solo si tiene traslado habilitado">
              <input
                type="number" min={0} step={0.01}
                value={option.net_transfer_price_usd ?? ''}
                onChange={(e) => update('net_transfer_price_usd', e.target.value ? Number(e.target.value) : null)}
                className="input"
                placeholder="Ej: 15"
              />
            </Field>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Neto adulto (ARS)" hint="Obligatorio para calcular el incentivo">
              <input
                type="number" min={0} step={1}
                value={option.net_price_adult_ars ?? ''}
                onChange={(e) => update('net_price_adult_ars', e.target.value ? Number(e.target.value) : null)}
                className="input"
                placeholder="Ej: 50000"
              />
            </Field>
            <Field label="Neto menor (ARS)" hint="Si vacío, usa el neto adulto">
              <input
                type="number" min={0} step={1}
                value={option.net_price_child_ars ?? ''}
                onChange={(e) => update('net_price_child_ars', e.target.value ? Number(e.target.value) : null)}
                className="input"
                placeholder="Ej: 35000"
              />
            </Field>
            <Field label="Neto traslado (ARS/pax)" hint="Solo si tiene traslado habilitado">
              <input
                type="number" min={0} step={1}
                value={option.net_transfer_price_ars ?? ''}
                onChange={(e) => update('net_transfer_price_ars', e.target.value ? Number(e.target.value) : null)}
                className="input"
                placeholder="Ej: 8000"
              />
            </Field>
          </div>
        )}
      </div>

      <Field label="Días de operación" hint="Días de la semana en que este tier se puede reservar">
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

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Ventana de traslado" hint="Ej: 'Entre 19:30 y 20:00'">
          <input
            type="text" maxLength={200}
            value={option.pickup_window_es ?? ''} onChange={(e) => update('pickup_window_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Horario cena" hint="Ej: 'Cena desde 20:00'">
          <input
            type="text" maxLength={200}
            value={option.dinner_time_es ?? ''} onChange={(e) => update('dinner_time_es', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Horario show" hint="Ej: 'Show desde 22:00'">
          <input
            type="text" maxLength={200}
            value={option.show_time_es ?? ''} onChange={(e) => update('show_time_es', e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={option.has_dinner ?? false}
            onChange={(checked) => update('has_dinner', checked)}
          />
          <span className="text-sm text-cream/80">Incluye cena</span>
        </label>
        <div className="sm:col-span-2 space-y-1.5">
          <span className="block text-sm text-cream/80">Traslado</span>
          <div className="flex gap-2 flex-wrap">
            {([
              { value: 'none', label: 'No incluye' },
              { value: 'optional', label: 'Opcional (con costo)' },
              { value: 'included', label: 'Incluido (sin costo)' },
            ] as const).map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => update('transfer_mode', m.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  (option.transfer_mode ?? 'none') === m.value
                    ? 'bg-gold text-ink'
                    : 'bg-ink/40 text-cream/60 border border-gold/20 hover:border-gold/40'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {option.transfer_mode === 'optional' && (
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
          {option.transfer_mode === 'optional' && (
            <label className="flex items-center gap-2 pt-1">
              <Checkbox
                checked={option.infant_transfer_chargeable ?? false}
                onChange={(checked) => update('infant_transfer_chargeable', checked)}
              />
              <span className="text-sm text-cream/80">Cobrar traslado a infantes</span>
            </label>
          )}
        </div>
        <Field label="Orden display" hint="Menor número aparece primero dentro del producto">
          <input
            type="number"
            value={option.display_order ?? 0}
            onChange={(e) => update('display_order', Number(e.target.value))}
            className="input"
          />
        </Field>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={option.is_active ?? true}
            onChange={(checked) => update('is_active', checked)}
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
