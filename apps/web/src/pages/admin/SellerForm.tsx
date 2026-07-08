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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="font-display text-4xl text-cream">
            {isNew ? 'Nuevo vendedor' : seller?.name ?? 'Cargando...'}
          </h1>
          {seller?.contact_phone && (
            <a
              href={`https://wa.me/${seller.contact_phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${seller.name.split(' ')[0]}, te contacto desde Tangos y Milongas Tickets.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-[#25D366]/15 border border-[#25D366]/30 px-3 py-2 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/25 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current shrink-0" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
          )}
        </div>
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
