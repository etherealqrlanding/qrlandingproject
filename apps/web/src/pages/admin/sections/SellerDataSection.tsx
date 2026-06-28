import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSeller } from '../../../lib/adminApi';
import InvitePortalSection from './InvitePortalSection';

interface Props {
  seller: AdminSeller | null;
  isNew: boolean;
  onCreated: (s: AdminSeller) => void;
  onUpdated: (s: AdminSeller) => void;
  onDelete?: () => void;
  onPermanentDelete?: () => void;
}

const SELLER_KINDS = [
  { value: 'uber', label: 'Uber / Cabify' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'concierge', label: 'Conserje' },
  { value: 'agency', label: 'Agencia' },
  { value: 'guide', label: 'Guía turístico' },
  { value: 'influencer', label: 'Influencer / Web' },
  { value: 'other', label: 'Otro' },
];

const empty = {
  code: '', name: '',
  contact_email: '', contact_phone: '',
  kind: '', commission_percent: 10,
  notes: '', is_active: true, is_permanent: false,
};

export default function SellerDataSection({ seller, isNew, onCreated, onUpdated, onDelete, onPermanentDelete }: Readonly<Props>) {
  const [form, setForm] = useState(() => seller ? { ...empty, ...seller, commission_percent: Number(seller.commission_percent) } : { ...empty });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (seller) {
      setForm({ ...empty, ...seller, commission_percent: Number(seller.commission_percent) });
      setDirty(false);
    }
  }, [seller]);

  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const generateCode = () => {
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    const prefix = (form.kind || 'VEN').slice(0, 3).toUpperCase();
    update('code', `${prefix}-${random}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        commission_percent: Number(form.commission_percent),
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        kind: form.kind || null,
        notes: form.notes || null,
      };
      if (isNew) {
        const created = await adminApi.sellers.create(payload);
        onCreated(created);
      } else if (seller) {
        const updated = await adminApi.sellers.update(seller.id, payload);
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
        <pre className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-xs text-cream/90 whitespace-pre-wrap">{error}</pre>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nombre / Razón social" required>
          <input type="text" required maxLength={160}
            value={form.name} onChange={(e) => update('name', e.target.value)} className="input" />
        </Field>
        <Field label="Tipo">
          <select value={form.kind ?? ''} onChange={(e) => update('kind', e.target.value)} className="input">
            <option value="">Sin especificar</option>
            {SELLER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field
          label="Código del QR"
          required
          hint="Va en la URL: ticketstangoshow.com/?ref=CODIGO. Solo letras, números, guion y guion bajo."
        >
          <div className="flex gap-2">
            <input
              type="text" required maxLength={32} minLength={3}
              pattern="[A-Za-z0-9_-]{3,32}"
              value={form.code}
              onChange={(e) => update('code', e.target.value)}
              className="input font-mono"
              disabled={!isNew}
            />
            {isNew && (
              <button type="button" onClick={generateCode} className="btn-ghost text-xs whitespace-nowrap">
                Generar
              </button>
            )}
          </div>
        </Field>
        <Field label="Comisión (%)" required hint="Entre 0 y 100. Se aplica a todas las ventas que genere.">
          <input
            type="number" required min={0} max={100} step={0.1}
            value={form.commission_percent}
            onChange={(e) => update('commission_percent', Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Email de contacto" hint="Se usa para notificarle sus comisiones">
          <input
            type="email" maxLength={160}
            value={form.contact_email ?? ''}
            onChange={(e) => update('contact_email', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Teléfono / WhatsApp">
          <input
            type="tel" maxLength={40}
            value={form.contact_phone ?? ''}
            onChange={(e) => update('contact_phone', e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <Field label="Notas internas" hint="No se le muestra al vendedor. Para tu referencia.">
        <textarea
          rows={4} maxLength={1000}
          value={form.notes ?? ''}
          onChange={(e) => update('notes', e.target.value)}
          className="input"
        />
      </Field>

      <div className="space-y-3">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.is_active} onChange={(e) => update('is_active', e.target.checked)} className="accent-gold" />
          <span className="text-cream/80">Activo (los QR son válidos y las nuevas ventas se atribuyen)</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.is_permanent ?? false} onChange={(e) => update('is_permanent', e.target.checked)} className="accent-gold" />
          <span className="text-cream/80">
            Vendedor permanente
            <span className="ml-2 text-xs text-cream/50">(habilita el cobro en efectivo desde el checkout)</span>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gold/10">
        <div className="flex items-center gap-4">
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-sm text-bordeaux-light hover:text-bordeaux-light/80">
              Desactivar vendedor
            </button>
          )}
          {onPermanentDelete && (
            <button type="button" onClick={onPermanentDelete} className="text-sm text-red-500 hover:text-red-400">
              Eliminar vendedor
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dirty && !isNew && <span className="text-xs text-gold-soft">Cambios sin guardar</span>}
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : isNew ? 'Crear vendedor' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {!isNew && seller && (
        <InvitePortalSection seller={seller} onUpdated={onUpdated} />
      )}
    </form>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
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
