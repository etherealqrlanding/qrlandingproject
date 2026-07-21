import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminCategory, type AdminProductDetail } from '../../lib/adminApi';
import OptionsEditor from './sections/OptionsEditor';
import ImagesEditor from './sections/ImagesEditor';
import GeneralSection from './sections/GeneralSection';
import ProductAvailabilityEditor from './sections/ProductAvailabilityEditor';
import ConfirmDialog from '../../components/ConfirmDialog';

type Tab = 'general' | 'options' | 'availability' | 'images';
type DeleteDialog = 'deactivate' | 'hard';

export default function ProductForm() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('general');
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DeleteDialog | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    adminApi.categories.list().then(setCategories).catch(() => { /* ignore for now */ });
  }, []);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    adminApi.products.get(Number(id))
      .then(setProduct)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const handleCreated = (newProduct: AdminProductDetail) => {
    navigate(`/admin/products/${newProduct.id}`, { replace: true });
    setProduct(newProduct);
  };

  const handleUpdated = (updated: AdminProductDetail) => setProduct(updated);

  const runDeactivate = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      await adminApi.products.delete(product.id);
      navigate('/admin/products');
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
      setDialog(null);
    } finally {
      setDeleting(false);
    }
  };

  const runHardDelete = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      await adminApi.products.delete(product.id, { hard: true });
      navigate('/admin/products');
    } catch (err) {
      // 409 = aparece en órdenes históricas: solo se puede desactivar.
      setError(err instanceof AdminApiError ? err.message : (err as Error).message);
      setDialog(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <Link to="/admin/products" className="text-sm text-gold-soft hover:text-gold">
        ← Volver al listado
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="font-display text-4xl text-cream">
          {isNew ? 'Nuevo producto' : product?.name ?? 'Cargando...'}
        </h1>
        {product && (
          <p className="mt-1 text-sm text-cream/50">{product.venue_name} · /{product.slug}</p>
        )}
      </header>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <div className="h-10 rounded bg-ink-soft/60 animate-pulse" />
          <div className="h-32 rounded bg-ink-soft/60 animate-pulse" />
        </div>
      )}

      {!loading && (
        <>
          {!isNew && (
            <div className="flex gap-1 border-b border-gold/10 mb-6 overflow-x-auto">
              {(['general', 'options', 'availability', 'images'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm transition border-b-2 -mb-px ${
                    tab === t
                      ? 'border-gold text-gold'
                      : 'border-transparent text-cream/60 hover:text-cream'
                  }`}
                >
                  {t === 'general' && 'Datos generales'}
                  {t === 'options' && `Tiers / Opciones (${product?.options.length ?? 0})`}
                  {t === 'availability' && 'Disponibilidad por fecha'}
                  {t === 'images' && `Imágenes (${product?.images.length ?? 0})`}
                </button>
              ))}
            </div>
          )}

          {tab === 'general' && (
            <GeneralSection
              product={product}
              categories={categories}
              isNew={isNew}
              onCreated={handleCreated}
              onUpdated={handleUpdated}
              onDelete={isNew ? undefined : () => setDialog('deactivate')}
              onHardDelete={isNew ? undefined : () => setDialog('hard')}
            />
          )}
          {tab === 'options' && product && (
            <OptionsEditor product={product} onChange={handleUpdated} />
          )}
          {tab === 'availability' && product && (
            <ProductAvailabilityEditor product={product} />
          )}
          {tab === 'images' && product && (
            <ImagesEditor product={product} onChange={handleUpdated} />
          )}
        </>
      )}

      <ConfirmDialog
        open={dialog === 'deactivate'}
        danger={false}
        title="Desactivar producto"
        message={<p>Se ocultará <strong className="text-cream">{product?.name}</strong> de la web pública, pero queda en la base y podés reactivarlo cuando quieras. No afecta a las órdenes existentes.</p>}
        confirmLabel="Desactivar"
        loading={deleting}
        onConfirm={runDeactivate}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'hard'}
        title="Eliminar producto definitivamente"
        message={
          <>
            <p>Vas a eliminar <strong className="text-cream">{product?.name}</strong> de forma permanente, junto con sus tiers, imágenes y cupos. Esta acción no se puede deshacer.</p>
            <p className="text-cream/50">Si el producto aparece en órdenes históricas, no se podrá borrar (solo desactivar) para preservar el historial de ventas.</p>
          </>
        }
        confirmLabel="Eliminar definitivamente"
        requireText="ELIMINAR"
        loading={deleting}
        onConfirm={runHardDelete}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
