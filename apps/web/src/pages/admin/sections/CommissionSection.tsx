import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminOption, type AdminOptionKindAdjustment, type AdminProductDetail } from '../../../lib/adminApi';
import { SELLER_KINDS } from '../../../lib/sellerKinds';

interface Props {
  product: AdminProductDetail;
  // Al guardar el ajuste general de un tier, el producto cambia (product.options[i]
  // .commission_adjustment_percent) -- hay que avisarle a ProductForm para que
  // refresque su estado, mismo patrón que OptionsEditor.tsx (ver su `refresh()`).
  // Sin esto, el header "Ajuste general: X%" y el fallback de "Comisión vigente"
  // quedan mostrando el valor viejo hasta recargar la página a mano.
  onChange: (p: AdminProductDetail) => void;
}

const KIND_ROWS = [...SELLER_KINDS, { value: 'sin_especificar', label: 'Sin especificar', icon: '🌟', suggestsCash: false }];

// La comisión se ajusta por TIER (servicio), no por casa entera -- distintos servicios
// de la misma casa pueden tener márgenes distintos. Un override puntual por (tier,
// perfil) REEMPLAZA (no suma) el ajuste general de ESE tier, solo para ese perfil --
// los demás perfiles del mismo tier siguen usando su ajuste general.
export default function CommissionSection({ product, onChange }: Props) {
  const [baseByKind, setBaseByKind] = useState<Record<string, number> | null>(null);
  const [overridesByOption, setOverridesByOption] = useState<Record<number, AdminOptionKindAdjustment[]> | null>(null);
  const [expandedOptionId, setExpandedOptionId] = useState<number | null>(product.options[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  // Refresca TODO en tiempo real tras cualquier guardado: el producto completo (para
  // que el ajuste general de cada tier se vea al toque, sin recargar la página) más
  // la comisión base por perfil y los overrides puntuales de cada tier.
  const load = async () => {
    try {
      const [updatedProduct, base] = await Promise.all([
        adminApi.products.get(product.id),
        adminApi.settings.getSellerKindCommission(),
      ]);
      const lists = await Promise.all(
        updatedProduct.options.map((o) => adminApi.products.options.kindAdjustments.list(o.id)),
      );
      onChange(updatedProduct);
      setBaseByKind(base);
      setOverridesByOption(Object.fromEntries(updatedProduct.options.map((o, i) => [o.id, lists[i]])));
    } catch (err) {
      setError((err as AdminApiError).message);
    }
  };

  useEffect(() => { load(); }, [product.id]);

  if (!baseByKind || !overridesByOption) {
    return <div className="h-40 rounded-lg bg-ink-soft/60 animate-pulse max-w-3xl" />;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-cream/60">
        Cada tier/servicio de esta casa puede ajustar la comisión base del perfil de forma independiente -- algunos
        servicios tienen mejor margen que otros. Abrí un tier para editar su ajuste general y, si hace falta, un
        override puntual para un perfil determinado.
      </p>
      {error && <p className="text-sm text-bordeaux-light">{error}</p>}

      {product.options.length === 0 ? (
        <p className="text-sm text-cream/40">Este producto todavía no tiene tiers cargados.</p>
      ) : (
        <div className="space-y-2">
          {product.options.map((option) => (
            <OptionCommissionBlock
              key={option.id}
              option={option}
              baseByKind={baseByKind}
              overrides={overridesByOption[option.id] ?? []}
              expanded={expandedOptionId === option.id}
              onToggle={() => setExpandedOptionId((cur) => (cur === option.id ? null : option.id))}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OptionCommissionBlock({
  option, baseByKind, overrides, expanded, onToggle, onChanged,
}: {
  option: AdminOption;
  baseByKind: Record<string, number>;
  overrides: AdminOptionKindAdjustment[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [generalDraft, setGeneralDraft] = useState(String(option.commission_adjustment_percent));
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKind, setSavingKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGeneralDraft(String(option.commission_adjustment_percent));
  }, [option.commission_adjustment_percent]);

  useEffect(() => {
    setDrafts(Object.fromEntries(overrides.map((o) => [o.seller_kind, String(o.adjustment_percent)])));
  }, [overrides]);

  const overrideByKind = new Map(overrides.map((o) => [o.seller_kind, o.adjustment_percent]));

  const handleSaveGeneral = async () => {
    const n = Number(generalDraft);
    if (!Number.isFinite(n) || n < -100 || n > 100) {
      setError('Ingresá un porcentaje válido (-100 a 100).');
      return;
    }
    setError(null);
    setSavingGeneral(true);
    try {
      await adminApi.products.options.update(option.id, { commission_adjustment_percent: n });
      await onChanged();
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSaveKind = async (kind: string) => {
    const n = Number(drafts[kind]);
    if (!Number.isFinite(n) || n < -100 || n > 100) {
      setError('Ingresá un porcentaje válido (-100 a 100).');
      return;
    }
    setError(null);
    setSavingKind(kind);
    try {
      await adminApi.products.options.kindAdjustments.upsert(option.id, kind, n);
      await onChanged();
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setSavingKind(null);
    }
  };

  const handleClearKind = async (kind: string) => {
    setError(null);
    setSavingKind(kind);
    try {
      await adminApi.products.options.kindAdjustments.delete(option.id, kind);
      setDrafts((prev) => { const next = { ...prev }; delete next[kind]; return next; });
      await onChanged();
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setSavingKind(null);
    }
  };

  return (
    <div className="rounded-lg border border-gold/15 bg-ink-soft/50 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gold/5 transition"
      >
        <span className="text-cream font-medium text-sm">{option.name_es}</span>
        <span className="flex items-center gap-2 text-xs text-cream/50">
          Ajuste general: <span className="text-gold-soft">{option.commission_adjustment_percent > 0 ? '+' : ''}{option.commission_adjustment_percent}%</span>
          <span className={`transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gold/10 px-4 py-4 space-y-4">
          <div className="flex items-end gap-2 max-w-xs">
            <label className="block flex-1">
              <span className="block text-xs text-cream/60 mb-1">Ajuste general de este tier (%)</span>
              <input
                type="number" step={0.1} min={-100} max={100}
                value={generalDraft}
                onChange={(e) => setGeneralDraft(e.target.value)}
                className="input"
              />
            </label>
            <button
              type="button"
              disabled={savingGeneral}
              onClick={handleSaveGeneral}
              className="rounded-md border border-gold/30 px-3 py-2 text-xs text-cream hover:bg-gold/10 transition disabled:opacity-40"
            >
              {savingGeneral ? '...' : 'Guardar'}
            </button>
          </div>

          <div className="rounded-lg border border-gold/10 bg-ink/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/10 text-left text-cream/50 text-xs uppercase tracking-wide">
                  <th className="px-3 py-2">Perfil</th>
                  <th className="px-3 py-2">Base</th>
                  <th className="px-3 py-2">Override para este tier</th>
                  <th className="px-3 py-2">Comisión vigente</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {KIND_ROWS.map((k) => {
                  const base = baseByKind[k.value] ?? 10;
                  const hasOverride = overrideByKind.has(k.value);
                  const effectiveAdjustment = hasOverride ? overrideByKind.get(k.value)! : option.commission_adjustment_percent;
                  const effective = Math.max(0, Math.min(100, base + effectiveAdjustment));
                  return (
                    <tr key={k.value} className="border-b border-gold/5 last:border-0">
                      <td className="px-3 py-2 text-cream/80">{k.icon} {k.label}</td>
                      <td className="px-3 py-2 text-cream/60">{base}%</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number" step={0.1} min={-100} max={100}
                            value={drafts[k.value] ?? ''}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [k.value]: e.target.value }))}
                            placeholder="sin override"
                            className="input w-24 text-right"
                          />
                          <span className="text-cream/40 text-xs">%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`font-display text-base ${hasOverride ? 'text-gold' : 'text-cream/80'}`}>
                          {effective}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={savingKind === k.value || !drafts[k.value]}
                          onClick={() => handleSaveKind(k.value)}
                          className="rounded-md border border-gold/30 px-2.5 py-1 text-xs text-cream hover:bg-gold/10 transition disabled:opacity-40 mr-2"
                        >
                          {savingKind === k.value ? '...' : 'Guardar'}
                        </button>
                        {hasOverride && (
                          <button
                            type="button"
                            disabled={savingKind === k.value}
                            onClick={() => handleClearKind(k.value)}
                            className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                          >
                            Quitar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-sm text-bordeaux-light">{error}</p>}
        </div>
      )}
    </div>
  );
}
