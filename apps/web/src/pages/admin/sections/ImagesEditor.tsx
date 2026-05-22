import { useRef, useState } from 'react';
import { adminApi, AdminApiError, type AdminImage, type AdminProductDetail } from '../../../lib/adminApi';
import { supabase } from '../../../lib/supabase';

interface Props {
  product: AdminProductDetail;
  onChange: (p: AdminProductDetail) => void;
}

export default function ImagesEditor({ product, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const updated = await adminApi.products.get(product.id);
    onChange(updated);
  };

  const handleFiles = async (files: FileList) => {
    setError(null);
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) {
          throw new Error(`"${file.name}" no es una imagen.`);
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error(`"${file.name}" supera 8MB.`);
        }
        const signed = await adminApi.uploads.sign(file.name, file.type);

        // Subida directa a Supabase Storage usando el signed upload URL
        const { error: upErr } = await supabase.storage
          .from('product-images')
          .uploadToSignedUrl(signed.path, signed.token, file, {
            contentType: file.type,
            upsert: false,
          });
        if (upErr) throw upErr;

        await adminApi.products.images.create(product.id, {
          url: signed.public_url,
          alt_text: file.name.replace(/\.[^.]+$/, ''),
          is_hero: product.images.length === 0 && i === 0,
          display_order: product.images.length + i + 1,
        });

        setProgress({ done: i + 1, total: files.length });
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetHero = async (img: AdminImage) => {
    try {
      await adminApi.products.images.update(img.id, { is_hero: true });
      await refresh();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  const handleMove = async (img: AdminImage, delta: -1 | 1) => {
    try {
      await adminApi.products.images.update(img.id, { display_order: img.display_order + delta });
      await refresh();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  const handleDelete = async (img: AdminImage) => {
    if (!confirm('¿Eliminar esta imagen?')) return;
    try {
      await adminApi.products.images.delete(img.id);
      await refresh();
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border-2 border-dashed border-gold/30 bg-ink-soft/40 p-8 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          hidden
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); }}
        />
        <p className="text-cream/80">
          {uploading
            ? `Subiendo ${progress?.done ?? 0} / ${progress?.total ?? 0}...`
            : 'Arrastrá imágenes acá o hacé click para seleccionar'}
        </p>
        <p className="mt-1 text-xs text-cream/40">JPG, PNG, WebP o AVIF · máx 8MB cada una</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-ghost mt-4 disabled:opacity-50"
        >
          Seleccionar imágenes
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90">
          {error}
        </div>
      )}

      {product.images.length === 0 ? (
        <p className="text-sm text-cream/50 text-center py-8">
          Sin imágenes todavía. Subí la primera para que aparezca en la card y el carousel.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {product.images.map((img) => (
            <div key={img.id} className="rounded-lg overflow-hidden border border-gold/10 bg-ink-soft/40">
              <div className="relative aspect-[4/3] bg-ink">
                <img src={img.url} alt={img.alt_text ?? ''} className="absolute inset-0 h-full w-full object-cover" />
                {img.is_hero && (
                  <span className="absolute top-2 left-2 bg-gold/90 text-ink text-xs uppercase tracking-wider px-2 py-0.5 rounded">
                    Hero
                  </span>
                )}
              </div>
              <div className="p-3 space-y-2">
                <p className="text-xs text-cream/60 truncate">{img.alt_text ?? '—'}</p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleMove(img, -1)}
                      className="text-xs px-2 py-1 rounded bg-ink/40 hover:bg-gold/10 text-cream/70"
                      title="Subir orden"
                    >↑</button>
                    <button type="button" onClick={() => handleMove(img, 1)}
                      className="text-xs px-2 py-1 rounded bg-ink/40 hover:bg-gold/10 text-cream/70"
                      title="Bajar orden"
                    >↓</button>
                  </div>
                  <div className="flex gap-2 text-xs">
                    {!img.is_hero && (
                      <button type="button" onClick={() => handleSetHero(img)}
                        className="text-gold-soft hover:text-gold"
                      >Marcar hero</button>
                    )}
                    <button type="button" onClick={() => handleDelete(img)}
                      className="text-bordeaux-light hover:text-bordeaux-light/80"
                    >Eliminar</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
