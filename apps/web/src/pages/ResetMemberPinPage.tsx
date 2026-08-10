import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Logo from '../components/Logo';
import { sellerApi, SellerApiError } from '../lib/sellerApi';

// Página pública (sin login) donde un sub-vendedor que se olvidó su PIN elige uno
// nuevo, a partir del link de un solo uso que le llega por email — ver
// sellerApi.members.forgotPin / resetPin y api/src/routes/seller/index.ts.
export default function ResetMemberPinPage() {
  const { token } = useParams<{ token: string }>();

  const [phase, setPhase] = useState<'loading' | 'form' | 'saving' | 'success' | 'error'>('loading');
  const [memberName, setMemberName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setPhase('error'); setErrorMsg('Link inválido.'); return; }
    sellerApi.members.resetPinPreview(token)
      .then((data) => { setMemberName(data.member_name); setPhase('form'); })
      .catch((err) => {
        setErrorMsg(err instanceof SellerApiError ? err.message : 'No se pudo validar el link.');
        setPhase('error');
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    if (!/^\d{4,6}$/.test(pin)) return setFormError('El PIN debe tener entre 4 y 6 dígitos.');
    if (pin !== pinConfirm) return setFormError('Los dos PIN no coinciden.');
    setPhase('saving');
    try {
      await sellerApi.members.resetPin(token, pin);
      setPhase('success');
    } catch (err) {
      setFormError(err instanceof SellerApiError ? err.message : 'No se pudo guardar el PIN.');
      setPhase('form');
    }
  };

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="h-10 w-auto" />
        </div>

        {phase === 'loading' && (
          <div className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-8 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-gold/40 border-t-gold animate-spin mx-auto mb-4" />
            <p className="text-sm text-cream/60">Validando el link...</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl border border-bordeaux-light/30 bg-ink-soft/60 p-8 text-center">
            <p className="text-lg font-display text-cream mb-2">No pudimos continuar</p>
            <p className="text-sm text-cream/60">{errorMsg}</p>
            <p className="mt-4 text-xs text-cream/40">
              Si el link venció, pedí uno nuevo desde donde ingresás tu PIN habitualmente.
            </p>
          </div>
        )}

        {(phase === 'form' || phase === 'saving') && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-8">
            <p className="text-lg font-display text-cream mb-1">Hola, {memberName}</p>
            <p className="text-sm text-cream/60 mb-6">Elegí tu PIN nuevo (4 a 6 dígitos).</p>

            <label className="block mb-4">
              <span className="block text-sm text-cream/80 mb-1.5">PIN nuevo</span>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoFocus
                className="input font-mono"
              />
            </label>
            <label className="block mb-5">
              <span className="block text-sm text-cream/80 mb-1.5">Confirmar PIN</span>
              <input
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                className="input font-mono"
              />
            </label>

            {formError && <p className="text-xs text-bordeaux-light mb-4">⚠ {formError}</p>}

            <button type="submit" disabled={phase === 'saving'} className="btn-primary w-full disabled:opacity-50">
              {phase === 'saving' ? 'Guardando...' : 'Guardar PIN nuevo'}
            </button>
          </form>
        )}

        {phase === 'success' && (
          <div className="rounded-2xl border border-gold/15 bg-ink-soft/60 p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gold" aria-hidden>
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-lg font-display text-cream mb-2">¡Listo!</p>
            <p className="text-sm text-cream/60">Ya podés usar tu PIN nuevo la próxima vez que te identifiques.</p>
          </div>
        )}
      </div>
    </div>
  );
}
