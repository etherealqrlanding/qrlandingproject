import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSetting } from '../../lib/adminApi';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSetting[] | null>(null);
  const [rate, setRate] = useState<string>('');
  const [mpFee, setMpFee] = useState<string>('10');
  const [saving, setSaving] = useState(false);
  const [savingFee, setSavingFee] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [savedFeeMessage, setSavedFeeMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorFee, setErrorFee] = useState<string | null>(null);

  const load = async () => {
    try {
      const [data, feeData] = await Promise.all([
        adminApi.settings.list(),
        adminApi.settings.getMpFeePct(),
      ]);
      setSettings(data);
      const exchange = data.find((s) => s.key === 'exchange_rate_usd_ars');
      if (exchange) {
        const value = exchange.value as { rate?: number };
        setRate(String(value.rate ?? ''));
      }
      setMpFee(String(feeData.pct));
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  useEffect(() => { load(); }, []);

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

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorFee(null);
    setSavedFeeMessage(null);
    setSavingFee(true);
    try {
      const pct = Number(mpFee);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Ingresá un porcentaje entre 0 y 100.');
      await adminApi.settings.updateMpFeePct(pct);
      setSavedFeeMessage('✓ Comisión MP actualizada.');
      setTimeout(() => setSavedFeeMessage(null), 3000);
    } catch (err) {
      setErrorFee((err as Error).message);
    } finally {
      setSavingFee(false);
    }
  };

  const exchange = settings?.find((s) => s.key === 'exchange_rate_usd_ars');
  const updatedAt = exchange?.updated_at;
  const mpFeePct = Number(mpFee);
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

      {/* Comisión Mercado Pago */}
      <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6 max-w-2xl">
        <h2 className="font-display text-2xl text-cream">Comisión Mercado Pago</h2>
        <p className="mt-2 text-sm text-cream/60">
          Porcentaje que cobra MP sobre el total bruto de cada operación. Se descuenta del precio de venta antes de calcular la comisión del vendedor.
          Verificá el valor vigente en tu panel de Mercado Pago.
        </p>

        <form onSubmit={handleSaveFee} className="mt-5 grid sm:grid-cols-[1fr_auto] gap-3">
          <label className="block">
            <span className="block text-sm text-cream/80 mb-1.5">Fee MP (%)</span>
            <div className="flex items-center gap-2">
              <input
                type="number" required min={0} max={100} step={0.1}
                value={mpFee}
                onChange={(e) => setMpFee(e.target.value)}
                className="input w-32"
              />
              <span className="text-cream/60">%</span>
            </div>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={savingFee} className="btn-primary disabled:opacity-50">
              {savingFee ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>

        {savedFeeMessage && <p className="mt-3 text-sm text-gold">{savedFeeMessage}</p>}
        {errorFee && <p className="mt-3 text-sm text-bordeaux-light">{errorFee}</p>}
      </section>

      {/* Ejemplo de cálculo de comisión */}
      {rateNum > 0 && mpFeePct >= 0 && (
        <section className="rounded-lg border border-gold/10 bg-ink/30 p-5 max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-gold-soft">Ejemplo de comisión</p>
          <p className="mt-3 text-sm text-cream/70">
            Venta de <span className="text-cream">USD 150</span> con neto operador <span className="text-cream">USD 120</span>:
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-cream/50">Precio de venta</span>
              <span className="text-cream">USD 150</span>
            </div>
            <div className="flex justify-between text-green-400/80">
              <span>Efectivo → comisión vendedor</span>
              <span>USD {(150 - 120).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gold">
              <span>Mercado Pago ({mpFeePct}% fee) → comisión vendedor</span>
              <span>USD {Math.max(0, 150 * (1 - mpFeePct / 100) - 120).toFixed(2)}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
