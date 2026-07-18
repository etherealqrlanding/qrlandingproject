import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/Logo';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

interface OrderPreview {
  public_id: string;
  status: string;
  payment_method: string;
  customer_name: string;
  option_name: string;
  service_date: string;
  total_ars: number;
}

interface ActionPreview {
  action: 'collect' | 'cancel';
  seller_name: string;
  order: OrderPreview;
}

function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

const ERROR_LABELS: Record<string, string> = {
  token_not_found: 'El link no es válido.',
  token_used: 'Esta acción ya fue realizada anteriormente.',
  token_expired: 'El link venció (validez 48 h). Ingresá al portal para actuar sobre la reserva.',
  order_not_actionable: 'La reserva ya no se puede procesar — puede haber sido cobrada, cancelada o modificada.',
  order_not_cash: 'Esta reserva no es de tipo efectivo.',
  order_settled: 'La reserva ya fue liquidada y no se puede cancelar.',
  outside_cancel_window: 'La reserva está fuera del período de cancelación permitido.',
  network_error: 'Error de conexión. Revisá tu internet e intentá de nuevo.',
};

export default function ActionPage() {
  const { token } = useParams<{ token: string }>();

  const [phase, setPhase] = useState<'loading' | 'preview' | 'confirming' | 'success' | 'error'>('loading');
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');

  useEffect(() => {
    if (!token) { setPhase('error'); setErrorCode('token_not_found'); return; }
    fetch(`${API_URL}/api/action/${token}`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setErrorCode(body.error ?? 'unknown');
          setErrorMsg(body.message ?? '');
          setPhase('error');
        } else {
          setPreview(body.data as ActionPreview);
          setPhase('preview');
        }
      })
      .catch(() => { setErrorCode('network_error'); setPhase('error'); });
  }, [token]);

  async function handleConfirm() {
    if (!token || !preview) return;
    setPhase('confirming');
    try {
      const res = await fetch(`${API_URL}/api/action/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: preview.action === 'collect' ? JSON.stringify({ currency }) : undefined,
      });
      const body = await res.json();
      if (!res.ok) {
        setErrorCode(body.error ?? 'unknown');
        setErrorMsg(body.message ?? '');
        setPhase('error');
      } else {
        setPhase('success');
      }
    } catch {
      setErrorCode('network_error');
      setPhase('error');
    }
  }

  const isCollect = preview?.action === 'collect';

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo className="h-10 w-auto" />
        </div>

        {phase === 'loading' && (
          <div className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-8 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-gold/40 border-t-gold animate-spin mx-auto mb-4" />
            <p className="text-cream/50 text-sm">Verificando link...</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl border border-bordeaux-light/30 bg-bordeaux-deep/20 p-8 text-center">
            <p className="text-4xl mb-4">⚠</p>
            <h1 className="font-display text-2xl text-cream mb-2">Link no disponible</h1>
            <p className="text-cream/60 text-sm leading-relaxed">
              {errorMsg || ERROR_LABELS[errorCode] || 'Ocurrió un error inesperado.'}
            </p>
            <p className="mt-6 text-xs text-cream/30">
              Si necesitás ayuda, accedé al portal de vendedores o escribinos por WhatsApp.
            </p>
          </div>
        )}

        {(phase === 'preview' || phase === 'confirming') && preview && (
          <div className="rounded-2xl border border-gold/15 bg-ink-soft/60 overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-gold/10">
              <p className="text-xs text-gold/70 uppercase tracking-widest mb-1">
                {isCollect ? 'Confirmar cobro en efectivo' : 'Cancelar reserva'}
              </p>
              <h1 className="font-display text-2xl text-cream">
                {isCollect ? '¿Recibiste el pago?' : '¿Cancelar esta reserva?'}
              </h1>
            </div>

            <div className="px-6 py-4 space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-gold/8">
                <span className="text-cream/50">Pasajero</span>
                <span className="text-cream font-medium">{preview.order.customer_name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gold/8">
                <span className="text-cream/50">Servicio</span>
                <span className="text-cream/80 text-right max-w-[60%]">{preview.order.option_name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gold/8">
                <span className="text-cream/50">Fecha</span>
                <span className="text-cream/80">{preview.order.service_date}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-cream/50">Total</span>
                <span className="text-gold font-semibold font-mono">{fmtArs(preview.order.total_ars)}</span>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2">
              {isCollect ? (
                <>
                  <p className="text-xs text-cream/50 mb-2">¿En qué moneda cobraste?</p>
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setCurrency('ARS')}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        currency === 'ARS'
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-gold/15 text-cream/50 hover:border-gold/30'
                      }`}
                    >
                      Pesos (ARS)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        currency === 'USD'
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-gold/15 text-cream/50 hover:border-gold/30'
                      }`}
                    >
                      Dólares (USD)
                    </button>
                  </div>
                  <p className="text-xs text-cream/40 mb-4 leading-relaxed">
                    Al confirmar, se registrará el cobro y se enviará la confirmación al pasajero automáticamente.
                  </p>
                </>
              ) : (
                <p className="text-xs text-cream/40 mb-4 leading-relaxed">
                  Al cancelar, se notificará al pasajero y al administrador. Esta acción no se puede deshacer desde aquí.
                </p>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                disabled={phase === 'confirming'}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-60 ${
                  isCollect
                    ? 'bg-gold text-ink hover:bg-gold-soft'
                    : 'border border-bordeaux-light/40 text-bordeaux-light hover:bg-bordeaux-deep/30'
                }`}
              >
                {phase === 'confirming'
                  ? 'Procesando...'
                  : isCollect
                    ? '✓ Sí, confirmar cobro'
                    : 'Sí, cancelar reserva'}
              </button>
            </div>
          </div>
        )}

        {phase === 'success' && preview && (
          <div className="rounded-2xl border border-gold/20 bg-ink-soft/60 p-8 text-center">
            <p className="text-5xl mb-4">{isCollect ? '✓' : '✓'}</p>
            <h1 className="font-display text-2xl text-cream mb-2">
              {isCollect ? '¡Cobro confirmado!' : 'Reserva cancelada'}
            </h1>
            <p className="text-cream/60 text-sm leading-relaxed">
              {isCollect
                ? 'El pasajero recibirá su confirmación por email. ¡Gracias!'
                : 'Se notificó al pasajero y al administrador.'}
            </p>
          </div>
        )}

        <p className="text-center text-xs text-cream/20 mt-8">Tangos y Milongas Tickets · Portal de vendedores</p>
      </div>
    </div>
  );
}
