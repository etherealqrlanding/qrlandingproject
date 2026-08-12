import { useState } from 'react';
import { sellerApi, SellerApiError, type SellerMember } from '../../lib/sellerApi';
import SimpleSelect from '../SimpleSelect';

interface Props {
  members: SellerMember[];
  unlocked: { memberId: number; pin: string } | null;
  onUnlock: (memberId: number, pin: string) => void;
  onRelock: () => void;
  // Alternativa a identificarse como sub-vendedor: el administrador del vendedor
  // autoriza con su propio PIN (para cuando la persona correspondiente no está
  // disponible). Guarda el PIN validado, no un booleano — las acciones de abajo
  // lo siguen mandando en cada request real (el backend valida cada vez).
  adminUnlocked: string | null;
  onAdminUnlock: (pin: string) => void;
  onAdminRelock: () => void;
  // Modo abierto (sellers.team_pin_required = false): no hay nada que identificar,
  // así que no renderiza nada — las acciones sobre la orden no piden PIN.
  pinRequired?: boolean;
}

type Mode = 'member' | 'admin';

// Punto único para identificarse en una orden: valida el PIN una sola vez (contra
// el backend, sin hacer ninguna acción todavía) y, si es correcto, el resto de las
// acciones sobre ESTA orden (cobrar, modificar, cancelar, asignar) dejan de
// pedirlo de nuevo — reusan el mismo par ya confirmado. Dos caminos: identificarse
// como uno mismo (sub-vendedor) o, si esa persona no está disponible, autorizar
// con el PIN de administrador del vendedor. No renderiza nada si el vendedor no
// tiene equipo cargado (nada que identificar).
export default function OrderMemberGate({ members, unlocked, onUnlock, onRelock, adminUnlocked, onAdminUnlock, onAdminRelock, pinRequired = true }: Props) {
  const [mode, setMode] = useState<Mode>('member');
  const [memberId, setMemberId] = useState<number | ''>('');
  const [pin, setPin] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (members.length === 0 || !pinRequired) return null;

  if (unlocked) {
    const name = members.find((m) => m.id === unlocked.memberId)?.name ?? 'vos';
    return (
      <p className="mb-4 pb-3 border-b border-gold/10 text-xs text-cream/60">
        ✓ Ingresaste como <span className="text-cream font-medium">{name}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRelock(); }}
          className="ml-2 text-[10px] text-gold-soft hover:text-gold transition underline underline-offset-2"
        >
          cambiar
        </button>
      </p>
    );
  }

  if (adminUnlocked) {
    return (
      <p className="mb-4 pb-3 border-b border-gold/10 text-xs text-cream/60">
        ✓ Autorizaste como <span className="text-cream font-medium">administrador</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdminRelock(); }}
          className="ml-2 text-[10px] text-gold-soft hover:text-gold transition underline underline-offset-2"
        >
          cambiar
        </button>
      </p>
    );
  }

  const handleValidateMember = async () => {
    setError(null);
    if (memberId === '' || !/^\d{4,6}$/.test(pin)) {
      setError('Elegí tu nombre e ingresá tu PIN (4-6 dígitos).');
      return;
    }
    setVerifying(true);
    try {
      await sellerApi.verifyMemberPin(memberId, pin);
      onUnlock(memberId, pin);
      setPin('');
      setMemberId('');
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setVerifying(false);
    }
  };

  const handleValidateAdmin = async () => {
    setError(null);
    if (!/^\d{4,6}$/.test(adminPin)) {
      setError('Ingresá el PIN de administrador (4-6 dígitos).');
      return;
    }
    setVerifying(true);
    try {
      await sellerApi.verifyAdminPin(adminPin);
      onAdminUnlock(adminPin);
      setAdminPin('');
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mb-4 pb-3 border-b border-gold/10" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 mb-2">
        <p className="text-xs text-cream/50">
          Identificate para modificar, cancelar, cobrar o asignar esta reserva — se pide una sola vez por orden.
        </p>
      </div>
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          onClick={() => { setMode('member'); setError(null); }}
          className={`px-2.5 py-1 rounded-full text-[10px] border transition ${
            mode === 'member' ? 'border-gold bg-gold/15 text-gold' : 'border-cream/15 text-cream/50 hover:border-cream/30'
          }`}
        >
          Soy del equipo
        </button>
        <button
          type="button"
          onClick={() => { setMode('admin'); setError(null); }}
          className={`px-2.5 py-1 rounded-full text-[10px] border transition ${
            mode === 'admin' ? 'border-gold bg-gold/15 text-gold' : 'border-cream/15 text-cream/50 hover:border-cream/30'
          }`}
        >
          Soy administrador
        </button>
      </div>

      {mode === 'member' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <SimpleSelect
            size="sm"
            className="w-40"
            value={memberId === '' ? '' : String(memberId)}
            onChange={(v) => setMemberId(v === '' ? '' : Number(v))}
            options={[
              { value: '', label: 'Seleccioná tu nombre...' },
              ...members.map((m) => ({ value: String(m.id), label: m.name })),
            ]}
          />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Tu PIN"
            inputMode="numeric"
            className="w-24 rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          <button
            type="button"
            onClick={handleValidateMember}
            disabled={verifying}
            className="rounded-md bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
          >
            {verifying ? '...' : 'Validar'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="PIN de administrador"
            inputMode="numeric"
            className="w-32 rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          <button
            type="button"
            onClick={handleValidateAdmin}
            disabled={verifying}
            className="rounded-md bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
          >
            {verifying ? '...' : 'Validar'}
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-[10px] text-bordeaux-light">⚠ {error}</p>}
    </div>
  );
}
