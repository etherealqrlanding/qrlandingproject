import { useEffect, useRef, useState } from 'react';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { supabase } from '../../lib/supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/40 p-5">
      <p className="text-xs uppercase tracking-wider text-cream/50 mb-2">{label}</p>
      <p className="font-display text-3xl text-gold">{value}</p>
      {sub && <p className="mt-1 text-xs text-cream/40">{sub}</p>}
    </div>
  );
}

function fmt(usd: number) {
  return `USD ${usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-gold/25 bg-gold/5 px-3 py-1.5 text-xs text-gold-soft hover:bg-gold/15 transition"
    >
      {copied ? '✓ Copiado' : label}
    </button>
  );
}

export default function SellerDashboard() {
  const { me } = useSellerAuth();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const qrObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/seller/me/qr?size=400`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      qrObjectUrl.current = url;
      setQrUrl(url);
    })();
    return () => { cancelled = true; };
  }, [me]);

  // Limpiar blob URL al desmontar
  useEffect(() => {
    return () => {
      if (qrObjectUrl.current) URL.revokeObjectURL(qrObjectUrl.current);
    };
  }, []);

  if (!me) return null;

  const commissionRate = `${Number(me.commission_percent).toFixed(1)}%`;
  const pending = me.commission_pending_usd;
  const earned = me.commission_earned_usd;
  const paid = me.commission_paid_usd;
  const refLink = `${window.location.origin}/?ref=${encodeURIComponent(me.code)}`;

  const handleDownloadQr = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch(`${API_URL}/api/seller/me/qr?size=1024`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${me.code}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="font-display text-4xl text-cream">
          Hola, {me.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-cream/50">
          Tu tasa de comisión es del <span className="text-gold-soft">{commissionRate}</span> sobre cada venta generada con tu código{' '}
          <span className="font-mono text-gold-soft">{me.code}</span>
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="Ventas generadas" value={String(me.orders_paid)} sub="órdenes cobradas" />
        <StatCard label="Facturación total" value={fmt(me.revenue_paid_usd)} sub="suma de tus ventas" />
        <StatCard label="Comisión ganada" value={fmt(earned)} sub={`${commissionRate} de tus ventas`} />
        <StatCard label="Ya cobrado" value={fmt(paid)} sub="liquidado a tu cuenta" />
        <StatCard label="Pendiente de cobro" value={fmt(pending)} sub={pending > 0 ? 'en proceso de liquidación' : 'al día'} />
      </section>

      {pending > 0 && (
        <div className="rounded-xl border border-gold/20 bg-gold/5 p-5 text-sm text-cream/80 mb-8">
          <p className="font-medium text-gold mb-1">Tenés comisión pendiente de liquidación</p>
          <p>
            {fmt(pending)} todavía no te fue transferido. Cuando el equipo de Ethereal Tours procese el pago, vas a verlo reflejado en la sección <strong>Liquidaciones</strong>.
          </p>
        </div>
      )}

      {/* Tarjeta de vendedor + QR */}
      <section className="rounded-xl border border-gold/20 bg-ink-soft/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-gold/10">
          <p className="text-xs uppercase tracking-widest text-gold-soft">Tu perfil de vendedor</p>
        </div>

        <div className="grid md:grid-cols-[1fr_auto] gap-0 divide-y md:divide-y-0 md:divide-x divide-gold/10">
          {/* Info */}
          <div className="p-5 space-y-3">
            <InfoRow label="Nombre">{me.name}</InfoRow>
            <InfoRow label="Código">
              <span className="font-mono text-gold-soft">{me.code}</span>
            </InfoRow>
            {me.kind && <InfoRow label="Tipo">{me.kind}</InfoRow>}
            <InfoRow label="Comisión"><span className="text-gold">{commissionRate}</span></InfoRow>
            {me.contact_email && <InfoRow label="Email">{me.contact_email}</InfoRow>}
            {me.contact_phone && <InfoRow label="Teléfono">{me.contact_phone}</InfoRow>}

            {/* Link para compartir */}
            <div className="pt-2 border-t border-gold/10">
              <p className="text-xs text-cream/40 mb-2">Tu link de referido</p>
              <div className="flex items-center gap-2 rounded-lg border border-gold/15 bg-ink/40 px-3 py-2">
                <span className="text-xs text-cream/60 font-mono truncate flex-1">{refLink}</span>
                <CopyButton text={refLink} label="Copiar link" />
              </div>
              <p className="mt-1.5 text-[11px] text-cream/30">
                Compartí este link con tus pasajeros. Cada compra generada con él te acredita tu comisión automáticamente.
              </p>
            </div>
          </div>

          {/* QR */}
          <div className="p-5 flex flex-col items-center gap-4">
            <p className="text-xs uppercase tracking-widest text-cream/40 self-start md:self-center">Tu QR</p>
            <div className="rounded-xl border border-gold/15 bg-white p-3">
              {qrUrl ? (
                <img src={qrUrl} alt={`QR código ${me.code}`} className="w-40 h-40 block" />
              ) : (
                <div className="w-40 h-40 bg-gray-100 animate-pulse rounded" />
              )}
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={handleDownloadQr}
                className="w-full rounded-lg border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft hover:bg-gold/20 transition text-center"
              >
                ↓ Descargar QR (PNG)
              </button>
              <CopyButton text={refLink} label="Copiar link de referido" />
            </div>
            <p className="text-[10px] text-cream/25 text-center">
              Imprimí el QR o mostralo en pantalla para que tus pasajeros lo escaneen
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-cream/45 shrink-0">{label}</span>
      <span className="text-cream/90 text-right">{children}</span>
    </div>
  );
}
