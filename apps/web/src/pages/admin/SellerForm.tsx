import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, AdminApiError, type AdminSeller } from '../../lib/adminApi';
import SellerDataSection from './sections/SellerDataSection';
import SellerQrSection from './sections/SellerQrSection';
import SellerOrdersSection from './sections/SellerOrdersSection';
import ConfirmDialog from '../../components/ConfirmDialog';

type Tab = 'data' | 'qr' | 'orders';
type DeleteDialog = 'deactivate' | 'permanent' | 'permanent-force';

export default function SellerForm() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('data');
  const [seller, setSeller] = useState<AdminSeller | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DeleteDialog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [forceCount, setForceCount] = useState(0);

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

  const runDeactivate = async () => {
    if (!seller) return;
    setDeleting(true);
    try {
      await adminApi.sellers.delete(seller.id);
      navigate('/admin/sellers');
    } catch (err) {
      setError((err as AdminApiError).message);
      setDialog(null);
    } finally {
      setDeleting(false);
    }
  };

  // Primer intento sin force: si hay ventas, el backend responde 409 y escalamos
  // al diálogo reforzado que avisa que también se borrarán esas ventas.
  const runPermanentDelete = async () => {
    if (!seller) return;
    setDeleting(true);
    try {
      await adminApi.sellers.permanentDelete(seller.id);
      navigate('/admin/sellers');
    } catch (err) {
      const apiErr = err as AdminApiError;
      if (apiErr.status === 409) {
        const count = (apiErr.details as { order_count?: number } | undefined)?.order_count ?? 0;
        setForceCount(count);
        setDialog('permanent-force');
      } else {
        setError(apiErr.message);
        setDialog(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const runPermanentDeleteForce = async () => {
    if (!seller) return;
    setDeleting(true);
    try {
      await adminApi.sellers.permanentDelete(seller.id, { force: true });
      navigate('/admin/sellers');
    } catch (err) {
      setError((err as AdminApiError).message);
      setDialog(null);
    } finally {
      setDeleting(false);
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
              onDelete={isNew ? undefined : () => setDialog('deactivate')}
              onPermanentDelete={isNew ? undefined : () => setDialog('permanent')}
            />
          )}
          {tab === 'qr' && seller && <SellerQrSection seller={seller} />}
          {tab === 'orders' && seller && <SellerOrdersSection seller={seller} />}
        </>
      )}

      <ConfirmDialog
        open={dialog === 'deactivate'}
        danger={false}
        title="Desactivar vendedor"
        message={<p>Se ocultará a <strong className="text-cream">{seller?.name}</strong> del listado activo. Sus ventas históricas y comisiones se conservan, y podés reactivarlo cuando quieras.</p>}
        confirmLabel="Desactivar"
        loading={deleting}
        onConfirm={runDeactivate}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'permanent'}
        title="Eliminar vendedor definitivamente"
        message={<p>Vas a eliminar a <strong className="text-cream">{seller?.name}</strong> de forma permanente. Esta acción no se puede deshacer. Si tiene ventas asociadas, te lo vamos a advertir antes de borrarlas.</p>}
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={runPermanentDelete}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'permanent-force'}
        title="⚠ Este vendedor tiene ventas"
        message={
          <>
            <p>
              <strong className="text-cream">{seller?.name}</strong> tiene{' '}
              <strong className="text-bordeaux-light">{forceCount} venta(s)</strong> asociada(s).
            </p>
            <p>Si continuás, se eliminarán <strong className="text-cream">el vendedor y todas esas ventas</strong> (con sus pagos e items). Esta acción es <strong>irreversible</strong>.</p>
          </>
        }
        confirmLabel={`Eliminar vendedor y ${forceCount} venta(s)`}
        requireText="ELIMINAR"
        loading={deleting}
        onConfirm={runPermanentDeleteForce}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
