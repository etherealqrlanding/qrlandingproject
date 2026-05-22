import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminSeller } from '../../lib/adminApi';
import SellerDataSection from './sections/SellerDataSection';
import SellerQrSection from './sections/SellerQrSection';
import SellerOrdersSection from './sections/SellerOrdersSection';

type Tab = 'data' | 'qr' | 'orders';

export default function SellerForm() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('data');
  const [seller, setSeller] = useState<AdminSeller | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    adminApi.sellers.get(Number(id))
      .then(setSeller)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const handleCreated = (created: AdminSeller) => {
    navigate(`/admin/sellers/${created.id}`, { replace: true });
    setSeller(created);
    setTab('qr');
  };

  const handleUpdated = (updated: AdminSeller) => setSeller(updated);

  const handleDelete = async () => {
    if (!seller) return;
    if (!confirm(`¿Desactivar a "${seller.name}"? Sus ventas históricas se conservan.`)) return;
    try {
      await adminApi.sellers.delete(seller.id);
      navigate('/admin/sellers');
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  const handlePermanentDelete = async () => {
    if (!seller) return;
    if (!confirm(`¿Eliminar definitivamente a "${seller.name}"?\n\nEsta acción no se puede deshacer. Si el vendedor tiene ventas asociadas, no se permitirá la eliminación.`)) return;
    try {
      await adminApi.sellers.permanentDelete(seller.id);
      navigate('/admin/sellers');
    } catch (err) {
      alert((err as AdminApiError).message);
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <Link to="/admin/sellers" className="text-sm text-gold-soft hover:text-gold">
        ← Volver al listado
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="font-display text-4xl text-cream">
          {isNew ? 'Nuevo vendedor' : seller?.name ?? 'Cargando...'}
        </h1>
        {seller && (
          <p className="mt-1 text-sm text-cream/50">
            Código <span className="font-mono text-gold-soft">{seller.code}</span> · {Number(seller.commission_percent).toFixed(1)}% comisión
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="h-10 rounded bg-ink-soft/60 animate-pulse" />
          <div className="h-32 rounded bg-ink-soft/60 animate-pulse" />
        </div>
      ) : (
        <>
          {!isNew && (
            <div className="flex gap-1 border-b border-gold/10 mb-6">
              {(['data', 'qr', 'orders'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-sm transition border-b-2 -mb-px ${
                    tab === t ? 'border-gold text-gold' : 'border-transparent text-cream/60 hover:text-cream'
                  }`}
                >
                  {t === 'data' && 'Datos'}
                  {t === 'qr' && 'Código QR'}
                  {t === 'orders' && 'Ventas y comisiones'}
                </button>
              ))}
            </div>
          )}

          {tab === 'data' && (
            <SellerDataSection
              seller={seller}
              isNew={isNew}
              onCreated={handleCreated}
              onUpdated={handleUpdated}
              onDelete={isNew ? undefined : handleDelete}
              onPermanentDelete={isNew ? undefined : handlePermanentDelete}
            />
          )}
          {tab === 'qr' && seller && <SellerQrSection seller={seller} />}
          {tab === 'orders' && seller && <SellerOrdersSection seller={seller} />}
        </>
      )}
    </div>
  );
}
