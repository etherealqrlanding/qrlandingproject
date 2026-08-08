import { useEffect, useRef, useState } from 'react';
import { sellerApi, SellerApiError } from '../../lib/sellerApi';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import { supabase } from '../../lib/supabase';

const LOGO_BUCKET = 'seller-logos';
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

// Personalización de la landing pública — exclusivo de socios comerciales (hoteles,
// agencias) que el admin marcó como habilitados. Lo que cargan acá se muestra en la
// home pública mientras su código de referido esté activo (ver components/RefBadge.tsx).
export default function SellerBrandingSection() {
  const { me } = useSellerAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taglineRef = useRef<HTMLTextAreaElement>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [tagline, setTagline] = useState('');
  const [publicPhone, setPublicPhone] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me) return;
    setLogoUrl(me.logo_url);
    setTagline(me.tagline ?? '');
    setPublicPhone(me.public_phone ?? '');
  }, [me]);

  // Campo elástico: crece con el contenido en vez de scrollear adentro de una caja fija.
  useEffect(() => {
    const el = taglineRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [tagline]);

  if (!me?.landing_customization_enabled) return null;

  const handleUpload = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) return setError('El archivo tiene que ser una imagen.');
    if (file.size > MAX_LOGO_BYTES) return setError('El logo no puede superar 4MB.');
    setUploading(true);
    try {
      const signed = await sellerApi.branding.uploadSign(file.name, file.type);
      const { error: upErr } = await supabase.storage
        .from(LOGO_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      // El logo se guarda al toque (mismo criterio que las fotos de productos) — el
      // lema/teléfono se guardan aparte con "Guardar cambios".
      await sellerApi.branding.update({ logo_url: signed.public_url, tagline, public_phone: publicPhone });
      setLogoUrl(signed.public_url);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof SellerApiError ? err.message : (err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    setError(null);
    setUploading(true);
    try {
      await sellerApi.branding.update({ logo_url: null, tagline, public_phone: publicPhone });
      setLogoUrl(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof SellerApiError ? err.message : (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveText = async () => {
    setError(null);
    setSaving(true);
    try {
      await sellerApi.branding.update({ logo_url: logoUrl, tagline: tagline.trim(), public_phone: publicPhone.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof SellerApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-gold-soft mb-1">Personalizar mi página</h2>
      <p className="text-cream/50 text-xs mb-4">
        Como socio comercial, podés cargar tu logo, un lema y un teléfono de contacto que van a verse en la home
        del sitio mientras un cliente llegue con tu código. Todo es opcional.
      </p>

      <div className="rounded-xl border border-gold/15 bg-ink-soft/30 p-4 sm:p-5 space-y-5">
        {/* Logo */}
        <div>
          <span className="block text-sm text-cream/80 mb-2">Logo</span>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-lg border border-gold/20 bg-ink/40 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-cream/20 text-2xl">🏨</span>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif,image/svg+xml"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-lg border border-gold/25 px-3 py-2 text-xs text-gold-soft hover:bg-gold/10 transition disabled:opacity-50"
                >
                  {uploading ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={uploading}
                    className="text-xs text-cream/40 hover:text-bordeaux-light transition disabled:opacity-50"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-cream/35">PNG, JPG, WEBP o SVG — hasta 4MB.</p>
            </div>
          </div>
        </div>

        {/* Lema — campo elástico, crece con lo que se escribe */}
        <label className="block">
          <span className="block text-sm text-cream/80 mb-1.5">Lema <span className="text-cream/40">(opcional)</span></span>
          <textarea
            ref={taglineRef}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={240}
            rows={1}
            placeholder="Ej: Tu estadía, con la mejor selección de tango de Buenos Aires"
            className="w-full rounded-lg border border-gold/20 bg-ink/60 px-3 py-2.5 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40 resize-none overflow-hidden"
          />
        </label>

        {/* Teléfono público */}
        <label className="block">
          <span className="block text-sm text-cream/80 mb-1.5">Teléfono de contacto <span className="text-cream/40">(opcional)</span></span>
          <input
            value={publicPhone}
            onChange={(e) => setPublicPhone(e.target.value)}
            maxLength={40}
            placeholder="Ej: +54 9 11 3236-8312"
            className="w-full rounded-lg border border-gold/20 bg-ink/60 px-3 py-2.5 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          <p className="mt-1 text-[10px] text-cream/35">
            Se muestra a tus clientes en el sitio — puede ser distinto del teléfono con el que nos contactamos internamente.
          </p>
        </label>

        {error && <p className="text-xs text-bordeaux-light">⚠ {error}</p>}
        {saved && <p className="text-xs text-emerald-400">✓ Guardado</p>}

        <button
          type="button"
          onClick={handleSaveText}
          disabled={saving}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </section>
  );
}
