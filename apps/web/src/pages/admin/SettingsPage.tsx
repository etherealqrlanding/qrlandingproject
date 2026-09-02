import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSetting } from '../../lib/adminApi';
import { SELLER_KINDS } from '../../lib/sellerKinds';

// Preview en vivo del tipo de cambio con markup mientras el admin edita el %, sin
// esperar a guardar -- solo para mostrar, el cálculo real lo hace el backend al guardar.
function rateNumForMarkup(raw: number, markupInput: string): number {
  const pct = Number(markupInput);
  const safePct = Number.isFinite(pct) ? pct : 0;
  return Math.round(raw * (1 + safePct / 100) * 100) / 100;
}

const COMMISSION_KIND_ROWS = [...SELLER_KINDS, { value: 'sin_especificar', label: 'Sin especificar', icon: '🌟', suggestsCash: false }];

function SellerKindCommissionForm({
  values,
  onSave,
}: {
  values: Record<string, number> | null;
  onSave: (values: Record<string, number>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!values) return;
    setForm(Object.fromEntries(COMMISSION_KIND_ROWS.map((k) => [k.value, String(values[k.value] ?? 10)])));
  }, [values]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: Record<string, number> = {};
    for (const k of COMMISSION_KIND_ROWS) {
      const n = Number(form[k.value]);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setErr(`"${k.label}": ingresá un porcentaje válido (0 a 100).`);
        return;
      }
      parsed[k.value] = n;
    }
    setErr(null); setMsg(null); setSaving(true);
    try {
      await onSave(parsed);
      setMsg('✓ Guardado.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6 max-w-2xl">
      <h2 className="font-display text-2xl text-cream">Comisión base por perfil</h2>
      <p className="mt-2 text-sm text-cream/60">
        Cada perfil de vendedor tiene una comisión base. Un producto puntual puede ajustarla (para arriba o para
        abajo) desde su editor -- la comisión final de cada venta es esta base más el ajuste del producto.
      </p>
      <form onSubmit={handleSave} className="mt-5 space-y-3">
        {COMMISSION_KIND_ROWS.map((k) => (
          <label key={k.value} className="flex items-center justify-between gap-3 max-w-xs">
            <span className="text-sm text-cream/80">{k.icon} {k.label}</span>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={100} step={0.1}
                value={form[k.value] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [k.value]: e.target.value }))}
                className="input no-spinner w-24 text-right"
              />
              <span className="text-cream/50 text-sm">%</span>
            </div>
          </label>
        ))}
        <div className="pt-2">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        {msg && <p className="text-sm text-gold">{msg}</p>}
        {err && <p className="text-sm text-bordeaux-light">{err}</p>}
      </form>
    </section>
  );
}

function CutoffForm({
  title,
  description,
  hours,
  onSave,
}: {
  title: string;
  description: string;
  hours: number | null;
  onSave: (h: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(hours != null ? String(hours) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setValue(hours != null ? String(hours) : ''); }, [hours]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = parseInt(value, 10);
    if (!Number.isFinite(h) || h < 1) { setErr('Ingresá un número de horas válido (mínimo 1).'); return; }
    setErr(null); setMsg(null); setSaving(true);
    try {
      await onSave(h);
      setMsg('✓ Guardado.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleClear = async () => {
    setErr(null); setMsg(null); setSaving(true);
    try {
      await onSave(null);
      setValue('');
      setMsg('✓ Restricción eliminada.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6 max-w-2xl">
      <h2 className="font-display text-2xl text-cream">{title}</h2>
      <p className="mt-2 text-sm text-cream/60">{description}</p>
      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <label className="block max-w-xs">
          <span className="block text-sm text-cream/80 mb-1.5">Horas de anticipación mínima</span>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={720} step={1}
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="Ej: 24" className="input" />
            <span className="text-cream/50 text-sm shrink-0">horas</span>
          </div>
        </label>
        <div className="flex gap-3">
          <button type="submit" disabled={saving || !value} className="btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {hours != null && (
            <button type="button" onClick={handleClear} disabled={saving}
              className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50">
              Quitar restricción
            </button>
          )}
        </div>
        {msg && <p className="text-sm text-gold">{msg}</p>}
        {err && <p className="text-sm text-bordeaux-light">{err}</p>}
        {hours != null
          ? <p className="text-xs text-cream/40">Activo: se bloquea si faltan menos de {hours} hs para el servicio.</p>
          : <p className="text-xs text-cream/40">Sin restricción configurada — siempre permitido.</p>
        }
      </form>
    </section>
  );
}

function WhatsAppForm({
  number,
  onSave,
}: {
  number: string | null;
  onSave: (n: string) => Promise<void>;
}) {
  const [value, setValue] = useState(number ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setValue(number ?? ''); }, [number]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      setErr('Ingresá un número válido: solo dígitos, con código de país (ej: 5491132368312).');
      return;
    }
    setErr(null); setMsg(null); setSaving(true);
    try {
      await onSave(digits);
      setValue(digits);
      setMsg('✓ Guardado.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6 max-w-2xl">
      <h2 className="font-display text-2xl text-cream">WhatsApp de contacto</h2>
      <p className="mt-2 text-sm text-cream/60">
        Se usa en todo el contacto con nosotros de la app: el botón "Hablar por WhatsApp" del sitio público,
        el portal de recomendadores y el WhatsApp que se ofrece en los emails de reservas. Cambiarlo acá lo actualiza
        en todos esos lugares (los emails pueden tardar hasta 5 minutos en tomar el cambio).
      </p>
      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <label className="block max-w-xs">
          <span className="block text-sm text-cream/80 mb-1.5">Número (con código de país)</span>
          <input
            type="text" inputMode="numeric"
            value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="Ej: 5491132368312" className="input font-mono" />
        </label>
        <button type="submit" disabled={saving || !value} className="btn-primary disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        {msg && <p className="text-sm text-gold">{msg}</p>}
        {err && <p className="text-sm text-bordeaux-light">{err}</p>}
        <p className="text-xs text-cream/40">
          Sin "+" ni espacios ni guiones: código de país + código de área (sin el 0) + número (sin el 15). Ej: Buenos Aires → 5491132368312.
        </p>
      </form>
    </section>
  );
}

function ArchiveRetentionForm({
  days,
  onSave,
}: {
  days: number | null;
  onSave: (d: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(days != null ? String(days) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setValue(days != null ? String(days) : ''); }, [days]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = parseInt(value, 10);
    if (!Number.isFinite(d) || d < 1) { setErr('Ingresá una cantidad de días válida (mínimo 1).'); return; }
    setErr(null); setMsg(null); setSaving(true);
    try {
      await onSave(d);
      setMsg('✓ Guardado.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDisable = async () => {
    setErr(null); setMsg(null); setSaving(true);
    try {
      await onSave(null);
      setMsg('✓ Auto-archivado desactivado — solo se archiva a mano.');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6 max-w-2xl">
      <h2 className="font-display text-2xl text-cream">Archivo automático</h2>
      <p className="mt-2 text-sm text-cream/60">
        Las órdenes canceladas, reintegradas, caducadas o fallidas permanecen en la tabla principal este tiempo antes de archivarse solas.
        El botón de archivar a mano sigue disponible en cualquier momento.
      </p>
      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <label className="block max-w-xs">
          <span className="block text-sm text-cream/80 mb-1.5">Días en la tabla principal</span>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={365} step={1}
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="Ej: 5" className="input" />
            <span className="text-cream/50 text-sm shrink-0">días</span>
          </div>
        </label>
        <div className="flex gap-3">
          <button type="submit" disabled={saving || !value} className="btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {days != null && (
            <button type="button" onClick={handleDisable} disabled={saving}
              className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50">
              Desactivar auto-archivado
            </button>
          )}
        </div>
        {msg && <p className="text-sm text-gold">{msg}</p>}
        {err && <p className="text-sm text-bordeaux-light">{err}</p>}
        {days != null
          ? <p className="text-xs text-cream/40">Activo: se archivan solas {days} día(s) después de cancelarse/reintegrarse/caducar.</p>
          : <p className="text-xs text-cream/40">Desactivado — el archivado es solo manual.</p>
        }
      </form>
    </section>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSetting[] | null>(null);
  const [rate, setRate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modifyWindow, setModifyWindow] = useState<number | null>(null);
  const [cancelWindow, setCancelWindow] = useState<number | null>(null);
  const [archiveRetention, setArchiveRetention] = useState<number | null>(null);
  const [maintenance, setMaintenance] = useState<boolean>(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string | null>(null);
  const [rateMode, setRateMode] = useState<'auto' | 'manual'>('manual');
  const [rateModeSaving, setRateModeSaving] = useState(false);
  const [rateModeMsg, setRateModeMsg] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [kindCommissions, setKindCommissions] = useState<Record<string, number> | null>(null);
  const [rateMarkup, setRateMarkup] = useState<string>('0');
  const [rawRate, setRawRate] = useState<number | null>(null);
  const [markupSaving, setMarkupSaving] = useState(false);
  const [markupMsg, setMarkupMsg] = useState<string | null>(null);
  const [markupErr, setMarkupErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const [data, mw, cw, ar, mm, rm, ww, kc, markup] = await Promise.all([
        adminApi.settings.list(),
        adminApi.settings.getModifyWindow(),
        adminApi.settings.getCancelWindow(),
        adminApi.settings.getArchiveRetention(),
        adminApi.settings.getMaintenanceMode(),
        adminApi.settings.getExchangeRateMode(),
        adminApi.settings.getSupportWhatsapp(),
        adminApi.settings.getSellerKindCommission(),
        adminApi.settings.getExchangeRateMarkup(),
      ]);
      setSettings(data);
      setModifyWindow(mw.hours);
      setCancelWindow(cw.hours);
      setArchiveRetention(ar.days);
      setMaintenance(mm.enabled);
      setRateMode(rm.mode);
      setWhatsapp(ww.number);
      setKindCommissions(kc);
      setRateMarkup(String(markup.percent));
      const exchange = data.find((s) => s.key === 'exchange_rate_usd_ars');
      if (exchange) {
        const value = exchange.value as { rate?: number; raw_rate?: number };
        setRate(String(value.rate ?? ''));
        setRawRate(value.raw_rate ?? null);
      }
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleMaintenance = async () => {
    setMaintenanceSaving(true);
    setMaintenanceMsg(null);
    const next = !maintenance;
    try {
      const res = await adminApi.settings.setMaintenanceMode(next);
      setMaintenance(res.enabled);
      setMaintenanceMsg(
        res.enabled
          ? '⚠ Modo mantenimiento ACTIVADO — el sitio público está bloqueado.'
          : '✓ Sitio público restaurado. Ya pueden acceder los pasajeros.',
      );
      setTimeout(() => setMaintenanceMsg(null), 6000);
    } catch (err) {
      setMaintenanceMsg(`Error: ${(err as Error).message}`);
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const handleToggleRateMode = async () => {
    setRateModeSaving(true);
    setRateModeMsg(null);
    const next = rateMode === 'auto' ? 'manual' : 'auto';
    try {
      const res = await adminApi.settings.updateExchangeRateMode(next);
      setRateMode(res.mode);
      setRate(String(res.rate));
      setRateModeMsg(
        res.mode === 'auto'
          ? '✓ Automático activado — sincronizado con dolarapi.com (oficial).'
          : '✓ Modo manual — el valor no se actualiza solo.',
      );
      await load();
      setTimeout(() => setRateModeMsg(null), 4000);
    } catch (err) {
      setRateModeMsg(`Error: ${(err as Error).message}`);
    } finally {
      setRateModeSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setRateModeSaving(true);
    setRateModeMsg(null);
    try {
      const res = await adminApi.settings.syncExchangeRateNow();
      setRate(String(res.rate));
      setRateModeMsg('✓ Sincronizado.');
      await load();
      setTimeout(() => setRateModeMsg(null), 3000);
    } catch (err) {
      setRateModeMsg(`Error: ${(err as Error).message}`);
    } finally {
      setRateModeSaving(false);
    }
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const r = Number(rate);
      if (!Number.isFinite(r) || r <= 0) throw new Error('Ingresá un tipo de cambio válido (mayor a 0).');
      await adminApi.settings.updateExchangeRate(r);
      setSavedMessage('✓ Tipo de cambio actualizado.');
      await load();
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMarkup = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(rateMarkup);
    if (!Number.isFinite(p) || p < -50 || p > 200) {
      setMarkupErr('Ingresá un porcentaje válido (-50 a 200).');
      return;
    }
    setMarkupErr(null); setMarkupMsg(null); setMarkupSaving(true);
    try {
      const res = await adminApi.settings.updateExchangeRateMarkup(p);
      setRate(String(res.rate));
      setMarkupMsg('✓ Guardado.');
      await load();
      setTimeout(() => setMarkupMsg(null), 3000);
    } catch (err) {
      setMarkupErr((err as Error).message);
    } finally {
      setMarkupSaving(false);
    }
  };

  const exchange = settings?.find((s) => s.key === 'exchange_rate_usd_ars');
  const updatedAt = exchange?.updated_at;
  const rateNum = Number(rate);

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Configuración</p>
        <h1 className="mt-2 font-display text-4xl text-cream">Settings</h1>
      </header>

      <WhatsAppForm
        number={whatsapp}
        onSave={async (n) => {
          const res = await adminApi.settings.updateSupportWhatsapp(n);
          setWhatsapp(res.number);
        }}
      />

      {/* Tipo de cambio */}
      <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6 max-w-2xl">
        <h2 className="font-display text-2xl text-cream">Tipo de cambio USD → ARS</h2>
        <p className="mt-2 text-sm text-cream/60">
          Se aplica al crear cada preference de Mercado Pago. El precio se muestra en USD pero el cobro se procesa en pesos argentinos.
        </p>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-md border border-gold/10 bg-ink/30 p-4">
          <div>
            <p className="text-sm text-cream/80">
              {rateMode === 'auto' ? 'Automático — dolarapi.com (oficial)' : 'Manual'}
            </p>
            <p className="mt-0.5 text-xs text-cream/45">
              {rateMode === 'auto'
                ? 'Se sincroniza solo cada 30 minutos con la cotización oficial (venta).'
                : 'El valor queda fijo hasta que lo cambies vos o actives el automático.'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {rateMode === 'auto' && (
              <button type="button" onClick={handleSyncNow} disabled={rateModeSaving}
                className="rounded-md border border-gold/20 px-3 py-1.5 text-xs text-cream/70 hover:border-gold/40 transition disabled:opacity-50">
                Sincronizar ahora
              </button>
            )}
            <button
              type="button"
              disabled={rateModeSaving}
              onClick={handleToggleRateMode}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                rateMode === 'auto' ? 'border-gold bg-gold' : 'border-gold/30 bg-ink-soft'
              }`}
              aria-pressed={rateMode === 'auto'}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-cream shadow transition-transform duration-200 mt-0.5 ${
                  rateMode === 'auto' ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
        {rateModeMsg && <p className="mt-2 text-sm text-gold">{rateModeMsg}</p>}

        {rateMode === 'auto' && (
          <form onSubmit={handleSaveMarkup} className="mt-5 rounded-md border border-gold/10 bg-ink/30 p-4 space-y-3">
            <div>
              <p className="text-sm text-cream/80">Markup sobre dolarapi.com</p>
              <p className="mt-0.5 text-xs text-cream/45">
                % que se suma al valor oficial de dolarapi.com para tener un tipo de cambio propio (competitivo,
                con impuestos propios cargados, etc.). Se aplica en cada sync automático.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block text-xs text-cream/60 mb-1">Markup (%)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number" step={0.1} min={-50} max={200}
                    value={rateMarkup}
                    onChange={(e) => setRateMarkup(e.target.value)}
                    className="input no-spinner w-28"
                  />
                  <span className="text-cream/50 text-sm">%</span>
                </div>
              </label>
              <button type="submit" disabled={markupSaving} className="btn-primary disabled:opacity-50">
                {markupSaving ? 'Guardando...' : 'Guardar'}
              </button>
              {rawRate != null && (
                <div className="text-xs text-cream/50">
                  Dolarapi.com: <span className="text-cream/80">ARS {rawRate.toLocaleString('es-AR')}</span>
                  {' → '}
                  con markup: <span className="text-gold">ARS {rateNumForMarkup(rawRate, rateMarkup).toLocaleString('es-AR')}</span>
                </div>
              )}
            </div>
            {markupMsg && <p className="text-sm text-gold">{markupMsg}</p>}
            {markupErr && <p className="text-sm text-bordeaux-light">{markupErr}</p>}
          </form>
        )}

        <form onSubmit={handleSaveRate} className="mt-5 grid sm:grid-cols-[1fr_auto] gap-3">
          <label className="block">
            <span className="block text-sm text-cream/80 mb-1.5">1 USD =</span>
            <div className="flex items-center gap-2">
              <input
                type="number" required min={0} step={0.01}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="input no-spinner"
              />
              <span className="text-cream/60">ARS</span>
            </div>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
        {rateMode === 'auto' && (
          <p className="mt-2 text-xs text-cream/40">Guardar un valor acá pasa el modo a manual.</p>
        )}

        {savedMessage && <p className="mt-3 text-sm text-gold">{savedMessage}</p>}
        {error && <p className="mt-3 text-sm text-bordeaux-light">{error}</p>}

        {updatedAt && (
          <p className="mt-4 text-xs text-cream/40">
            Última actualización: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </section>

      {rate && rateNum > 0 && (
        <section className="rounded-lg border border-gold/10 bg-ink/30 p-5 max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-gold-soft">Ejemplo de conversión</p>
          <p className="mt-2 text-sm text-cream/70">
            Una venta de <span className="text-cream">USD 140</span> se cobraría como{' '}
            <span className="text-gold">ARS {(140 * rateNum).toLocaleString('es-AR')}</span> en Mercado Pago.
          </p>
        </section>
      )}

      <SellerKindCommissionForm
        values={kindCommissions}
        onSave={async (values) => {
          const res = await adminApi.settings.updateSellerKindCommission(values);
          setKindCommissions(res);
        }}
      />

      {/* Cómo se calcula la comisión */}
      <section className="rounded-lg border border-gold/10 bg-ink/30 p-5 max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-gold-soft">Cómo se calcula el incentivo</p>
        <p className="mt-3 text-sm text-cream/70">
          Ejemplo: venta <span className="text-cream">USD 150</span>, neto operador <span className="text-cream">USD 120</span>, incentivo del recomendador <span className="text-cream">15%</span>.
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between text-green-400/80">
            <span>Efectivo → el recomendador nos liquida el neto</span>
            <span>nos rinde USD 120 · gana USD {(150 - 120).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gold">
            <span>Mercado Pago → le liquidamos su incentivo (% × venta)</span>
            <span>USD {(150 * 0.15).toFixed(2)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-cream/40">
          En efectivo el incentivo del recomendador es total − neto (ya se la queda al cobrar). En Mercado Pago nosotros cobramos y le pagamos su incentivo.
        </p>
      </section>

      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Operaciones del día</p>
        <h2 className="mt-1 font-display text-2xl text-cream">Ventanas horarias</h2>
        <p className="mt-1 text-sm text-cream/50">
          Si configurás una ventana, las reservas cuya fecha de servicio es hoy solo podrán modificarse o cancelarse dentro del horario indicado (hora Buenos Aires).
          Fuera de esa franja, los botones quedan bloqueados para el admin y el recomendador.
        </p>
      </header>

      <CutoffForm
        title="Anticipación mínima para modificar"
        description="Si configurás 24hs, no se podrá modificar (bajar/subir pasajeros) una reserva cuando falten menos de 24 horas para el servicio. El botón queda deshabilitado para el admin y el recomendador."
        hours={modifyWindow}
        onSave={async (h) => {
          const res = await adminApi.settings.updateModifyWindow(h);
          setModifyWindow(res.hours);
        }}
      />

      <CutoffForm
        title="Anticipación mínima para cancelar"
        description="Si configurás 24hs, no se podrá cancelar ni reintegrar una reserva cuando falten menos de 24 horas para el servicio. Se aplica al admin y al recomendador."
        hours={cancelWindow}
        onSave={async (h) => {
          const res = await adminApi.settings.updateCancelWindow(h);
          setCancelWindow(res.hours);
        }}
      />

      <ArchiveRetentionForm
        days={archiveRetention}
        onSave={async (d) => {
          const res = await adminApi.settings.updateArchiveRetention(d);
          setArchiveRetention(res.days);
        }}
      />

      {/* Modo mantenimiento */}
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Emergencias</p>
        <h2 className="mt-1 font-display text-2xl text-cream">Modo mantenimiento</h2>
        <p className="mt-1 text-sm text-cream/50">
          Bloquea el sitio público para pasajeros. Útil ante imprevistos operativos o fuerza mayor.
          El panel de administración y el portal de recomendadores siguen accesibles.
        </p>
      </header>

      <section className={`rounded-lg border p-6 max-w-2xl transition-colors ${
        maintenance
          ? 'border-red-500/50 bg-red-950/30'
          : 'border-gold/15 bg-ink-soft/50'
      }`}>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className={`font-medium text-sm ${maintenance ? 'text-red-400' : 'text-cream/80'}`}>
              {maintenance ? '⚠ Sitio público FUERA DE SERVICIO' : 'Sitio público operativo'}
            </p>
            <p className="mt-1 text-xs text-cream/50">
              {maintenance
                ? 'Los pasajeros ven una pantalla de mantenimiento. No pueden reservar ni navegar el catálogo.'
                : 'Los pasajeros pueden acceder y reservar con normalidad.'}
            </p>
          </div>
          <button
            type="button"
            disabled={maintenanceSaving}
            onClick={handleToggleMaintenance}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              maintenance ? 'border-red-500 bg-red-500' : 'border-gold/30 bg-ink-soft'
            }`}
            aria-pressed={maintenance}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-cream shadow transition-transform duration-200 mt-0.5 ${
                maintenance ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {maintenance && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
            <strong>Recordá desactivar</strong> el modo mantenimiento una vez resuelta la situación para que los pasajeros puedan volver a reservar.
          </div>
        )}

        {maintenanceMsg && (
          <p className={`mt-3 text-sm ${maintenance ? 'text-red-400' : 'text-gold'}`}>
            {maintenanceMsg}
          </p>
        )}
      </section>
    </div>
  );
}
