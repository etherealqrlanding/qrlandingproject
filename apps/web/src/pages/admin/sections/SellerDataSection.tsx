import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSeller } from '../../../lib/adminApi';
import { SELLER_KINDS, sellerKindSuggestsCash } from '../../../lib/sellerKinds';
import InvitePortalSection from './InvitePortalSection';
import Checkbox from '../../../components/Checkbox';

interface Props {
  seller: AdminSeller | null;
  isNew: boolean;
  onCreated: (s: AdminSeller) => void;
  onUpdated: (s: AdminSeller) => void;
  onDelete?: () => void;
  onPermanentDelete?: () => void;
}

const empty = {
  code: '', name: '',
  contact_email: '', contact_phone: '',
  kind: '', commission_percent: 10,
  notes: '', is_active: true, is_permanent: false, card_enabled: true, is_house: false,
  landing_customization_enabled: false,
  team_enabled: false,
  team_pin_required: true,
};

export default function SellerDataSection({ seller, isNew, onCreated, onUpdated, onDelete, onPermanentDelete }: Readonly<Props>) {
  const [form, setForm] = useState(() => seller ? { ...empty, ...seller, commission_percent: Number(seller.commission_percent) } : { ...empty });
  const [emailConfirm, setEmailConfirm] = useState(() => seller?.contact_email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (seller) {
      setForm({ ...empty, ...seller, commission_percent: Number(seller.commission_percent) });
      setEmailConfirm(seller.contact_email ?? '');
      setDirty(false);
    }
  }, [seller]);

  const emailMismatch = (form.contact_email ?? '').trim() !== ''
    && (form.contact_email ?? '').trim().toLowerCase() !== emailConfirm.trim().toLowerCase();

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
    if (emailMismatch) {
      setError('El email y su confirmación no coinciden.');
      return;
    }
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
        <Field label="Perfil" hint="Define el mensaje de bienvenida que ve el cliente al escanear el QR.">
          <select
            value={form.kind ?? ''}
            onChange={(e) => {
              const kind = e.target.value;
              // Sugerencia, no imposición: al elegir un perfil pre-tildamos "vendedor
              // permanente" según lo típico de ese perfil (Recepción/Agencias sí,
              // el resto no) — el admin puede seguir ajustándolo a mano después.
              setForm((prev) => ({ ...prev, kind, is_permanent: sellerKindSuggestsCash(kind) }));
              setDirty(true);
            }}
            className="input"
          >
            <option value="">Sin especificar</option>
            {SELLER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.icon} {k.label}</option>)}
          </select>
        </Field>
        <Field
          label="Código del QR"
          required
          hint="Va en la URL: tangoqr.net/?ref=CODIGO. Solo letras, números, guion y guion bajo."
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
        <Field label="Incentivo (%)" required hint="Entre 0 y 100. Se aplica a todas las ventas que genere.">
          <input
            type="number" required min={0} max={100} step={0.1}
            value={form.commission_percent}
            onChange={(e) => update('commission_percent', Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Email de contacto" hint="Se usa para notificarle sus incentivos">
          <input
            type="email" maxLength={160}
            value={form.contact_email ?? ''}
            onChange={(e) => update('contact_email', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Confirmar email">
          <input
            type="email" maxLength={160}
            value={emailConfirm}
            onChange={(e) => setEmailConfirm(e.target.value)}
            className={`input ${emailMismatch ? 'border-bordeaux-light/60' : ''}`}
            autoComplete="off"
            onPaste={(e) => e.preventDefault()}
          />
          {emailMismatch && (
            <p className="mt-1 text-xs text-bordeaux-light">⚠ El email y su confirmación no coinciden.</p>
          )}
        </Field>
      </div>

      <Field
        label="Teléfono / WhatsApp"
        hint='Sin "+" ni espacios ni guiones: código de país + código de área (sin el 0) + número (sin el 15). Ej: Buenos Aires → 5491132368312. Habilita el botón de WhatsApp en su ficha.'
      >
        <input
          type="tel" maxLength={40}
          value={form.contact_phone ?? ''}
          onChange={(e) => update('contact_phone', e.target.value)}
          className="input font-mono"
        />
      </Field>

      <Field label="Notas internas" hint="No se le muestra al recomendador. Para tu referencia.">
        <textarea
          rows={4} maxLength={1000}
          value={form.notes ?? ''}
          onChange={(e) => update('notes', e.target.value)}
          className="input"
        />
      </Field>

      <div className="space-y-3">
        <label className="inline-flex items-center gap-2">
          <Checkbox checked={form.is_active} onChange={(checked) => update('is_active', checked)} />
          <span className="text-cream/80">Activo (los QR son válidos y las nuevas ventas se atribuyen)</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <Checkbox
            checked={form.is_permanent ?? false}
            onChange={(checked) => {
              if (!checked && !form.card_enabled) {
                setError('Tiene que quedar al menos un medio de pago habilitado (Tarjeta o Pago manual).');
                return;
              }
              update('is_permanent', checked);
            }}
          />
          <span className="text-cream/80">
            Pago manual habilitado
            <span className="ml-2 text-xs text-cream/50">(recomendador permanente — habilita el cobro en efectivo desde el checkout)</span>
          </span>
        </label>
        <label className="inline-flex items-center gap-2">
          <Checkbox
            checked={form.card_enabled ?? true}
            onChange={(checked) => {
              if (!checked && !form.is_permanent) {
                setError('Tiene que quedar al menos un medio de pago habilitado (Tarjeta o Pago manual).');
                return;
              }
              update('card_enabled', checked);
            }}
          />
          <span className="text-cream/80">
            Tarjeta habilitada
            <span className="ml-2 text-xs text-cream/50">(Mercado Pago + Pix — lo controla solo el admin de la plataforma)</span>
          </span>
        </label>
        <label className="inline-flex items-center gap-2">
          <Checkbox checked={form.is_house ?? false} onChange={(checked) => update('is_house', checked)} />
          <span className="text-cream/80">
            Cuenta propia (agencia)
            <span className="ml-2 text-xs text-cream/50">
              no es un afiliado externo — se excluye del revenue/incentivos del listado de recomendadores
            </span>
          </span>
        </label>
        <label className="inline-flex items-center gap-2">
          <Checkbox checked={form.landing_customization_enabled ?? false} onChange={(checked) => update('landing_customization_enabled', checked)} />
          <span className="text-cream/80">
            Puede personalizar su página
            <span className="ml-2 text-xs text-cream/50">
              (socios comerciales: puede cargar logo, lema y teléfono público que se muestran en la home a sus referidos)
            </span>
          </span>
        </label>
        <label className="inline-flex items-center gap-2">
          <Checkbox checked={form.team_enabled ?? false} onChange={(checked) => update('team_enabled', checked)} />
          <span className="text-cream/80">
            Habilitar "Mi equipo" (sub-recomendadores)
            <span className="ml-2 text-xs text-cream/50">
              (le muestra "Mi Equipo" en su portal para cargar conserjes/sub-recomendadores. Se puede apagar en cualquier momento sin perder lo ya cargado)
            </span>
          </span>
        </label>
        {form.team_enabled && (
          <label className="inline-flex items-center gap-2 ml-6">
            <Checkbox checked={form.team_pin_required ?? true} onChange={(checked) => update('team_pin_required', checked)} />
            <span className="text-cream/80">
              El equipo opera con PIN
              <span className="ml-2 text-xs text-cream/50">
                (identidad verificada en cada acción, como hoy. Desmarcalo para "modo abierto": cualquiera del equipo
                toma/reasigna/modifica/cancela sin PIN ni blanqueos — pensado para clientes donde no hace falta verificar
                identidad, solo prolijidad interna)
              </span>
            </span>
          </label>
        )}
        {form.is_house && (
          <p className="text-xs text-gold-soft bg-gold/5 border border-gold/15 rounded-md px-3 py-2">
            💡 Para ventas directas de la agencia (Instagram, WhatsApp, mostrador) sin pagarte incentivo a vos mismo,
            usá <strong>Incentivo 0%</strong>. Si solo querés cobrar por Mercado Pago (sin efectivo), dejá
            <strong> "Recomendador permanente"</strong> sin marcar.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gold/10">
        <div className="flex items-center gap-4">
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-sm text-bordeaux-light hover:text-bordeaux-light/80">
              Desactivar recomendador
            </button>
          )}
          {onPermanentDelete && (
            <button type="button" onClick={onPermanentDelete} className="text-sm text-red-500 hover:text-red-400">
              Eliminar recomendador
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dirty && !isNew && <span className="text-xs text-gold-soft">Cambios sin guardar</span>}
          <button type="submit" disabled={saving || emailMismatch} className="btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : isNew ? 'Crear recomendador' : 'Guardar cambios'}
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
