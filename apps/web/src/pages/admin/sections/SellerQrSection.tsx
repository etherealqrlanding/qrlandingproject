import { useEffect, useMemo, useState } from 'react';
import { type AdminSeller } from '../../../lib/adminApi';
import { supabase } from '../../../lib/supabase';

interface Props { seller: AdminSeller; }

const SIZE_OPTIONS = [
  { size: 256, label: 'Pequeño', use: 'Stickers, etiquetas' },
  { size: 512, label: 'Mediano (Recomendado)', use: 'Volantes, tarjetas' },
  { size: 1024, label: 'Grande', use: 'Carteles, posters' },
  { size: 2048, label: 'Extra grande', use: 'Banners' },
];

export default function SellerQrSection({ seller }: Props) {
  const [size, setSize] = useState(512);
  const [pngBlobUrl, setPngBlobUrl] = useState<string | null>(null);
  const [svgBlobUrl, setSvgBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const targetUrl = `${window.location.origin}/?ref=${seller.code}`;

  // Carga el QR con el token de auth (no se puede usar <img src> directo porque
  // los endpoints admin requieren Bearer token).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPngBlobUrl(null);
    setSvgBlobUrl(null);

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
      const headers = { Authorization: `Bearer ${token}` };
      const [pngRes, svgRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/sellers/${seller.id}/qr?format=png&size=${size}`, { headers }),
        fetch(`${apiUrl}/api/admin/sellers/${seller.id}/qr?format=svg&size=${size}`, { headers }),
      ]);
      if (cancelled) return;
      if (pngRes.ok) setPngBlobUrl(URL.createObjectURL(await pngRes.blob()));
      if (svgRes.ok) setSvgBlobUrl(URL.createObjectURL(await svgRes.blob()));
      setLoading(false);
    };
    load();

    return () => {
      cancelled = true;
      if (pngBlobUrl) URL.revokeObjectURL(pngBlobUrl);
      if (svgBlobUrl) URL.revokeObjectURL(svgBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.id, size]);

  const download = (url: string | null, format: string) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${seller.code}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(targetUrl);
  };

  const sharedWhatsapp = useMemo(() => {
    const message = `Hola! Te paso el link para reservar la experiencia: ${targetUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [targetUrl]);

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6">
        <p className="text-xs uppercase tracking-widest text-gold-soft">URL del QR</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text" readOnly value={targetUrl}
            className="input font-mono text-sm bg-ink/60"
          />
          <button type="button" onClick={copyUrl} className="btn-ghost text-sm whitespace-nowrap">
            Copiar
          </button>
        </div>
        <p className="mt-2 text-xs text-cream/50">
          Cualquier cliente que entre por este link se atribuye a <span className="text-cream">{seller.name}</span> y le suma {Number(seller.commission_percent).toFixed(1)}% de incentivo.
        </p>
      </section>

      <section className="rounded-lg border border-gold/15 bg-ink-soft/50 p-6">
        <header className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-gold-soft">Código QR</p>
            <h3 className="font-display text-2xl text-cream">Descargar</h3>
          </div>
          <select
            value={size} onChange={(e) => setSize(Number(e.target.value))}
            className="input max-w-xs"
          >
            {SIZE_OPTIONS.map((o) => (
              <option key={o.size} value={o.size}>{o.label} ({o.size}px) — {o.use}</option>
            ))}
          </select>
        </header>

        <div className="grid sm:grid-cols-[1fr_280px] gap-6 items-center">
          <div className="rounded-md bg-cream p-6 flex items-center justify-center">
            {loading || !pngBlobUrl ? (
              <div className="aspect-square w-full max-w-xs bg-ink-soft/30 animate-pulse" />
            ) : (
              <img src={pngBlobUrl} alt={`QR ${seller.code}`} className="w-full max-w-xs h-auto" />
            )}
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => download(pngBlobUrl, 'png')}
              disabled={!pngBlobUrl}
              className="btn-primary w-full disabled:opacity-40"
            >
              Descargar PNG
            </button>
            <button
              type="button"
              onClick={() => download(svgBlobUrl, 'svg')}
              disabled={!svgBlobUrl}
              className="btn-ghost w-full disabled:opacity-40"
            >
              Descargar SVG (vectorial)
            </button>
            <a href={sharedWhatsapp} target="_blank" rel="noreferrer"
              className="btn-ghost w-full block text-center"
            >
              Compartir por WhatsApp
            </a>
            <p className="text-xs text-cream/50 mt-4">
              Imprimí en alta calidad. El SVG escala a cualquier tamaño sin perder definición.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gold/10 bg-ink/30 p-5">
        <p className="text-xs uppercase tracking-widest text-gold-soft">💡 Cómo usarlo</p>
        <ul className="mt-3 space-y-1.5 text-sm text-cream/70">
          <li>1. Imprimí el QR en un sticker, tarjeta o cartel y entregáselo al recomendador.</li>
          <li>2. El recomendador lo muestra/comparte con sus clientes potenciales.</li>
          <li>3. El cliente escanea con la cámara del celular → llega a la landing con el código.</li>
          <li>4. Si compra, la venta queda atribuida automáticamente y el recomendador recibe el email de notificación con su incentivo.</li>
        </ul>
      </section>
    </div>
  );
}
