import { useEffect, useRef, useState } from 'react';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { sellerApi } from '../../lib/sellerApi';
import ShareButton from '../../components/ShareButton';
import { buildShareUrl } from '../../lib/shareLinks';
import { sellerKindLabel } from '../../lib/sellerKinds';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/40 p-3 md:p-5">
      <p className="text-[10px] uppercase tracking-wider text-cream/50 mb-1">{label}</p>
      <p className="font-display text-2xl md:text-3xl text-gold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-cream/40 hidden sm:block">{sub}</p>}
    </div>
  );
}

function fmt(ars: number) {
  return `ARS ${Math.round(ars).toLocaleString('es-AR')}`;
}

function QrImage({ url, error, code }: { url: string | null; error: boolean; code: string }) {
  if (error) {
    return (
      <div className="w-36 h-36 flex flex-col items-center justify-center gap-2 bg-gray-50 rounded">
        <span className="text-2xl">⚠️</span>
        <p className="text-[10px] text-gray-500 text-center px-2 leading-tight">
          No se pudo cargar el QR. Verificá la conexión.
        </p>
      </div>
    );
  }
  if (url) {
    return <img src={url} alt={`QR código ${code}`} className="w-36 h-36 block" />;
  }
  return <div className="w-36 h-36 bg-gray-100 animate-pulse rounded" />;
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
  const [qrError, setQrError] = useState(false);
  const qrObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setQrUrl(null);
    setQrError(false);
    (async () => {
      try {
        const blob = await sellerApi.qrBlob(400);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        qrObjectUrl.current = url;
        setQrUrl(url);
      } catch {
        if (!cancelled) setQrError(true);
      }
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
  const pending = me.commission_pending_ars;
  const earned = me.commission_earned_ars;
  const paid = me.commission_paid_ars;
  const netToSettle = me.net_pending_settlement_ars ?? 0;
  const refLink = buildShareUrl('/', me.code);
  const showsLink = buildShareUrl('/shows', me.code);

  const handleDownloadQr = async () => {
    try {
      const blob = await sellerApi.qrBlob(1024);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${me.code}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <header className="mb-5 md:mb-8">
        <h1 className="font-display text-3xl md:text-4xl text-cream">
          Hola, {me.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-xs md:text-sm text-cream/50">
          Comisión: <span className="text-gold-soft">{commissionRate}</span> · código{' '}
          <span className="font-mono text-gold-soft">{me.code}</span>
        </p>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5 md:mb-8">
        <StatCard label="Ventas" value={String(me.orders_paid)} sub="órdenes cobradas" />
        <StatCard label="Facturación" value={fmt(me.revenue_paid_ars)} sub="ventas por Mercado Pago" />
        <StatCard label="Comisión ganada" value={fmt(earned)} sub={`${commissionRate} de tus ventas`} />
        <StatCard label="Ya cobrado" value={fmt(paid)} sub="liquidado a tu cuenta" />
        <StatCard label="Pendiente (MP)" value={fmt(pending)} sub={pending > 0 ? 'a cobrar del operador' : 'al día'} />
        <StatCard label="Neto a rendir" value={fmt(netToSettle)} sub={netToSettle > 0 ? 'de ventas en efectivo' : 'al día'} />
      </section>

      {pending > 0 && (
        <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-cream/80 mb-5 md:mb-8">
          <p className="font-medium text-gold mb-1">Tenés comisión pendiente de liquidación</p>
          <p className="text-xs md:text-sm">
            {fmt(pending)} (ventas por Mercado Pago) no te fue transferido aún. Cuando el equipo procese el pago lo verás en <strong>Liquidaciones</strong>.
          </p>
        </div>
      )}

      {netToSettle > 0 && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-cream/80 mb-5 md:mb-8">
          <p className="font-medium text-emerald-400 mb-1">Tenés neto pendiente de rendir</p>
          <p className="text-xs md:text-sm">
            Por tus ventas en <strong>efectivo</strong> nos tenés que rendir el neto: <strong>{fmt(netToSettle)}</strong>. El monto que le cobrás al pasajero lo definís vos.
          </p>
        </div>
      )}

      {/* Tarjeta de vendedor + QR */}
      <section className="rounded-xl border border-gold/20 bg-ink-soft/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-gold/10">
          <p className="text-xs uppercase tracking-widest text-gold-soft">Tu perfil de vendedor</p>
        </div>

        <div className="grid md:grid-cols-[1fr_auto] gap-0">
          {/* Info — segundo en mobile, primero en desktop */}
          <div className="p-4 space-y-2.5 min-w-0 overflow-hidden order-2 md:order-1 border-t md:border-t-0 md:border-r border-gold/10">
            <InfoRow label="Nombre">{me.name}</InfoRow>
            <InfoRow label="Código">
              <span className="font-mono text-gold-soft">{me.code}</span>
            </InfoRow>
            {me.kind && <InfoRow label="Perfil">{sellerKindLabel(me.kind)}</InfoRow>}
            <InfoRow label="Comisión"><span className="text-gold">{commissionRate}</span></InfoRow>
            {me.contact_email && <InfoRow label="Email">{me.contact_email}</InfoRow>}
            {me.contact_phone && <InfoRow label="Teléfono">{me.contact_phone}</InfoRow>}

            {/* Links para compartir */}
            <div className="pt-2 border-t border-gold/10 space-y-3">
              <div>
                <p className="text-xs text-cream/40 mb-1.5">Tu link de referido</p>
                <div className="flex items-center gap-2 rounded-lg border border-gold/15 bg-ink/40 px-3 py-2 min-w-0 overflow-hidden">
                  <span className="text-xs text-cream/60 font-mono truncate min-w-0 flex-1">{refLink}</span>
                  <ShareButton
                    url={refLink}
                    title="Tangos y Milongas Tickets"
                    waMessage={`Hola! Te paso el link para reservar la experiencia: ${refLink}`}
                    label="Compartir"
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-cream/40 mb-1.5">Catálogo completo de shows</p>
                <div className="flex items-center gap-2 rounded-lg border border-gold/15 bg-ink/40 px-3 py-2 min-w-0 overflow-hidden">
                  <span className="text-xs text-cream/60 font-mono truncate min-w-0 flex-1">{showsLink}</span>
                  <ShareButton
                    url={showsLink}
                    title="Shows de Tango"
                    waMessage={`Hola! Mirá todos los shows de tango de Buenos Aires: ${showsLink}`}
                    label="Compartir"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* QR — primero en mobile, segundo en desktop */}
          <div className="p-4 flex flex-col items-center gap-3 order-1 md:order-2">
            <p className="self-start text-xs uppercase tracking-widest text-cream/40">Tu QR</p>
            <div className="rounded-xl border border-gold/15 bg-white p-2">
              <QrImage url={qrUrl} error={qrError} code={me.code} />
            </div>
            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={handleDownloadQr}
                disabled={!qrUrl}
                className="flex-1 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold-soft hover:bg-gold/20 transition text-center disabled:opacity-40"
              >
                ↓ Descargar QR
              </button>
              <CopyButton text={refLink} label="Copiar link" />
            </div>
            <p className="text-[10px] text-cream/25 text-center">
              Imprimí el QR o mostralo en pantalla
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-cream/45 shrink-0">{label}</span>
      <span className="text-cream/90 text-right min-w-0 break-all">{children}</span>
    </div>
  );
}
