import { useState } from 'react';
import { sellerApi, SellerApiError, type SellerMember } from '../../lib/sellerApi';

interface Props {
  member: SellerMember;
  onUnlockedAsMember: () => void;
  onUnlockedAsAdmin: () => void;
}

type Mode = 'member' | 'admin';

// Gate para ver el desglose de estadísticas de UN sub-vendedor puntual — no confundir
// con OrderMemberGate (autoriza una acción sobre una orden puntual): acá lo que se
// desbloquea es "puedo ver los números de esta persona", vive mientras dure la
// sesión de esta pestaña (sin persistir en sessionStorage, igual que el resto de los
// gates de PIN de la app).
export default function TeamStatsGate({ member, onUnlockedAsMember, onUnlockedAsAdmin }: Readonly<Props>) {
  const [mode, setMode] = useState<Mode>(member.is_active ? 'member' : 'admin');
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Ingresá el PIN (4-6 dígitos).');
      return;
    }
    setVerifying(true);
    try {
      if (mode === 'member') {
        await sellerApi.verifyMemberPin(member.id, pin);
        onUnlockedAsMember();
      } else {
        await sellerApi.verifyAdminPin(pin);
        onUnlockedAsAdmin();
      }
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-4">
      <p className="text-sm text-cream/70 mb-1">
        Para ver las estadísticas de <span className="text-cream font-medium">{member.name}</span> hace falta identificarse.
      </p>
      <p className="text-[11px] text-cream/35 mb-3">
        El PIN no es una contraseña — solo confirma quién está mirando.
      </p>

      {!member.is_active && (
        <p className="text-[11px] text-amber-400 mb-3">
          {member.name} está desactivado — solo el administrador puede ver su historial.
        </p>
      )}

      <div className="flex gap-1 mb-2">
        {member.is_active && (
          <button
            type="button"
            onClick={() => { setMode('member'); setError(null); setPin(''); }}
            className={`px-2.5 py-1 rounded-full text-[10px] border transition ${
              mode === 'member' ? 'border-gold bg-gold/15 text-gold' : 'border-cream/15 text-cream/50 hover:border-cream/30'
            }`}
          >
            Soy {member.name.split(' ')[0]}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setMode('admin'); setError(null); setPin(''); }}
          className={`px-2.5 py-1 rounded-full text-[10px] border transition ${
            mode === 'admin' ? 'border-gold bg-gold/15 text-gold' : 'border-cream/15 text-cream/50 hover:border-cream/30'
          }`}
        >
          Soy administrador
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={mode === 'member' ? 'Tu PIN' : 'PIN de administrador'}
          inputMode="numeric"
          className="w-28 rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
        />
        <button
          type="button"
          onClick={handleValidate}
          disabled={verifying}
          className="rounded-md bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
        >
          {verifying ? '...' : 'Validar'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[10px] text-bordeaux-light">⚠ {error}</p>}
    </div>
  );
}
