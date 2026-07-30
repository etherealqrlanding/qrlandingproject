import { useEffect, useState } from 'react';
import { adminApi, type AdminHoldRow } from '../../lib/adminApi';

const POLL_MS = 10_000;

function fmtRemaining(expiresAt: string, now: number): string {
  const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PaymentMethodBadge({ method }: Readonly<{ method: AdminHoldRow['payment_method'] }>) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
      method === 'pix' ? 'border-gold/40 text-gold bg-gold/10' : 'border-cream/20 text-cream/70 bg-cream/5'
    }`}>
      {method === 'pix' ? 'PIX' : 'Mercado Pago'}
    </span>
  );
}

export default function HoldsList() {
  const [holds, setHolds] = useState<AdminHoldRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = () => {
    adminApi.holds.list()
      .then(setHolds)
      .catch((err) => setError((err as Error).message));
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <header className="mb-4 md:mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Checkout público</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Cupos en espera</h1>
        <p className="mt-2 text-sm text-cream/50">
          Checkouts de Mercado Pago o PIX en curso, con el cupo congelado hasta que se confirme
          el pago o venza el link/QR. Se actualiza solo cada 10s.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {!holds && !error && (
        <div className="space-y-3">
          {['sk-a', 'sk-b'].map((k) => (
            <div key={k} className="h-16 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      )}

      {holds && holds.length === 0 && (
        <p className="text-cream/60 text-sm">No hay cupos congelados en este momento.</p>
      )}

      {holds && holds.length > 0 && (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {holds.map((h) => (
              <div key={h.id} className="rounded-xl border border-gold/10 bg-ink-soft/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-cream text-sm font-medium truncate">{h.product_name}</p>
                    <p className="text-xs text-cream/50 truncate">{h.option_name}</p>
                  </div>
                  <PaymentMethodBadge method={h.payment_method} />
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-cream/50 flex-wrap">
                  <span>{h.service_date}</span>
                  <span>·</span>
                  <span>{h.pax} pax</span>
                  <span>·</span>
                  <span>USD {h.total_usd}</span>
                </div>
                <p className="mt-1 text-xs text-cream/40 truncate">{h.customer_name} · {h.customer_email}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-cream/40">{h.ref_code ?? '—'}</span>
                  <span className="font-mono text-sm text-gold">{fmtRemaining(h.expires_at, now)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2.5 px-3">Cliente</th>
                  <th className="text-left py-2.5 px-3">Show / Opción</th>
                  <th className="text-left py-2.5 px-3">Fecha</th>
                  <th className="text-right py-2.5 px-3">Pax</th>
                  <th className="text-left py-2.5 px-3">Medio</th>
                  <th className="text-right py-2.5 px-3">Total</th>
                  <th className="text-left py-2.5 px-3">Vendedor</th>
                  <th className="text-right py-2.5 px-3">Vence en</th>
                </tr>
              </thead>
              <tbody>
                {holds.map((h) => (
                  <tr key={h.id} className="border-t border-gold/5 hover:bg-gold/5">
                    <td className="py-2.5 px-3 text-xs">
                      <p className="text-cream">{h.customer_name}</p>
                      <p className="text-cream/40">{h.customer_email}</p>
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      <p className="text-cream">{h.product_name}</p>
                      <p className="text-cream/40">{h.option_name}</p>
                    </td>
                    <td className="py-2.5 px-3 text-cream/70 text-xs whitespace-nowrap">{h.service_date}</td>
                    <td className="py-2.5 px-3 text-right text-cream/70 tabular-nums text-xs">{h.pax}</td>
                    <td className="py-2.5 px-3"><PaymentMethodBadge method={h.payment_method} /></td>
                    <td className="py-2.5 px-3 text-right text-cream/80 tabular-nums text-xs whitespace-nowrap">
                      USD {h.total_usd} · ARS {Math.round(h.total_ars).toLocaleString('es-AR')}
                    </td>
                    <td className="py-2.5 px-3 text-cream/50 text-xs font-mono">{h.ref_code ?? '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-gold tabular-nums text-sm whitespace-nowrap">
                      {fmtRemaining(h.expires_at, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-cream/30 text-right">
            {holds.length} cupo{holds.length === 1 ? '' : 's'} congelado{holds.length === 1 ? '' : 's'}
          </p>
        </>
      )}
    </div>
  );
}
