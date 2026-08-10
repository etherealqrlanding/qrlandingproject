import { useRef, useState } from 'react';
import { adminApi, AdminApiError, type AdminProductDetail } from '../../../lib/adminApi';
import { supabase } from '../../../lib/supabase';

interface Props {
  product: AdminProductDetail;
  onChange: (p: AdminProductDetail) => void;
}

const MAX_LOGO_BYTES = 4 * 1024 * 1024;

// Logo de la casa — reemplaza la foto de portada en las cards (catálogo público y
// listado del admin). Vive en products.logo_url, separado de la galería de fotos
// (product_images, ver ImagesEditor). Mismo patrón de subida que esa, pero sin crear
// una fila en product_images: solo guarda la URL en el producto.
export default function ProductLogoEditor({ product, onChange }: Readonly<Props>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) return setError('El archivo tiene que ser una imagen.');
    if (file.size > MAX_LOGO_BYTES) return setError('El logo no puede superar 4MB.');
    setUploading(true);
    try {
      const signed = await adminApi.uploads.sign(file.name, file.type);
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const updated = await adminApi.products.update(product.id, { logo_url: signed.public_url });
      onChange(updated);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setError(null);
    setUploading(true);
    try {
      const updated = await adminApi.products.update(product.id, { logo_url: null });
      onChange(updated);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gold/15 bg-ink-soft/30 p-4 sm:p-5 mb-6">
      <p className="text-xs uppercase tracking-widest text-gold-soft mb-1">Logo de la casa</p>
      <p className="text-xs text-cream/50 mb-4">
        Reemplaza la foto de portada en las cards del catálogo público y en el listado del admin —
        no afecta a la galería de fotos de abajo.
      </p>
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-lg border border-gold/20 bg-ink/40 flex items-center justify-center overflow-hidden shrink-0">
          {product.logo_url ? (
            <img src={product.logo_url} alt="Logo" className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="text-cream/20 text-2xl">◈</span>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
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
              {uploading ? 'Subiendo...' : product.logo_url ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {product.logo_url && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="text-xs text-cream/40 hover:text-bordeaux-light transition disabled:opacity-50"
              >
                Quitar logo
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] text-cream/35">PNG, JPG, WEBP o AVIF — hasta 4MB.</p>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-bordeaux-light">⚠ {error}</p>}
    </div>
  );
}
