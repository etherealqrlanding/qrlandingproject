import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSetting } from '../../lib/adminApi';

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

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSetting[] | null>(null);
  const [rate, setRate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modifyWindow, setModifyWindow] = useState<number | null>(null);
  const [cancelWindow, setCancelWindow] = useState<number | null>(null);
  const [maintenance, setMaintenance] = useState<boolean>(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const [data, mw, cw, mm] = await Promise.all([
        adminApi.settings.list(),
        adminApi.settings.getModifyWindow(),
        adminApi.settings.getCancelWindow(),
        adminApi.settings.getMaintenanceMode(),
      ]);
      setSettings(data);
      setModifyWindow(mw.hours);
      setCancelWindow(cw.hours);
      setMaintenance(mm.enabled);
      const exchange = data.find((s) => s.key === 'exchange_rate_usd_ars');
      if (exchange) {
        const value = exchange.value as { rate?: number };
        setRate(String(value.rate ?? ''));
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

  const exchange = settings?.find((s) => s.key === 'exchange_rate_usd_ars');
  const updatedAt = exchange?.updated_at;
  const rateNum = Number(rate);

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Configuración</p>
        <h1 className="mt-2 font-display text-4xl text-cream">Settings</h1>
      </header>

      {/* Tipo de cambio */}
      <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6 max-w-2xl">
        <h2 className="font-display text-2xl text-cream">Tipo de cambio USD → ARS</h2>
        <p className="mt-2 text-sm text-cream/60">
          Se aplica al crear cada preference de Mercado Pago. El precio se muestra en USD pero el cobro se procesa en pesos argentinos.
          Actualizá manualmente cuando varíe el dólar.
        </p>

        <form onSubmit={handleSaveRate} className="mt-5 grid sm:grid-cols-[1fr_auto] gap-3">
          <label className="block">
            <span className="block text-sm text-cream/80 mb-1.5">1 USD =</span>
            <div className="flex items-center gap-2">
              <input
                type="number" required min={0} step={0.01}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="input"
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

      {/* Cómo se calcula la comisión */}
      <section className="rounded-lg border border-gold/10 bg-ink/30 p-5 max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-gold-soft">Cómo se calcula la comisión</p>
        <p className="mt-3 text-sm text-cream/70">
          Ejemplo: venta <span className="text-cream">USD 150</span>, neto operador <span className="text-cream">USD 120</span>, comisión del vendedor <span className="text-cream">15%</span>.
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between text-green-400/80">
            <span>Efectivo → el vendedor nos liquida el neto</span>
            <span>nos rinde USD 120 · gana USD {(150 - 120).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gold">
            <span>Mercado Pago → le liquidamos su comisión (% × venta)</span>
            <span>USD {(150 * 0.15).toFixed(2)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-cream/40">
          En efectivo la comisión del vendedor es total − neto (ya se la queda al cobrar). En Mercado Pago nosotros cobramos y le pagamos su comisión.
        </p>
      </section>

      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Operaciones del día</p>
        <h2 className="mt-1 font-display text-2xl text-cream">Ventanas horarias</h2>
        <p className="mt-1 text-sm text-cream/50">
          Si configurás una ventana, las reservas cuya fecha de servicio es hoy solo podrán modificarse o cancelarse dentro del horario indicado (hora Buenos Aires).
          Fuera de esa franja, los botones quedan bloqueados para el admin y el vendedor.
        </p>
      </header>

      <CutoffForm
        title="Anticipación mínima para modificar"
        description="Si configurás 24hs, no se podrá modificar (bajar/subir pasajeros) una reserva cuando falten menos de 24 horas para el servicio. El botón queda deshabilitado para el admin y el vendedor."
        hours={modifyWindow}
        onSave={async (h) => {
          const res = await adminApi.settings.updateModifyWindow(h);
          setModifyWindow(res.hours);
        }}
      />

      <CutoffForm
        title="Anticipación mínima para cancelar"
        description="Si configurás 24hs, no se podrá cancelar ni reintegrar una reserva cuando falten menos de 24 horas para el servicio. Se aplica al admin y al vendedor."
        hours={cancelWindow}
        onSave={async (h) => {
          const res = await adminApi.settings.updateCancelWindow(h);
          setCancelWindow(res.hours);
        }}
      />

      {/* Modo mantenimiento */}
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Emergencias</p>
        <h2 className="mt-1 font-display text-2xl text-cream">Modo mantenimiento</h2>
        <p className="mt-1 text-sm text-cream/50">
          Bloquea el sitio público para pasajeros. Útil ante imprevistos operativos o fuerza mayor.
          El panel de administración y el portal de vendedores siguen accesibles.
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
