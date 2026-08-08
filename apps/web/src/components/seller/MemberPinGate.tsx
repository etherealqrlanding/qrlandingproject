import type { SellerMember } from '../../lib/sellerApi';

interface Props {
  members: SellerMember[];
  memberId: number | '';
  memberPin: string;
  onMemberIdChange: (id: number | '') => void;
  onPinChange: (pin: string) => void;
  label?: string;
}

// Bloque "¿quién sos? + tu PIN" reutilizado en toda acción que modifica o cancela una
// orden. Si el vendedor no tiene equipo cargado, no renderiza nada (no le agrega
// fricción a un vendedor individual) — el gate real vive en el backend, esto es solo
// para no dejar confirmar sin completarlo cuando sí corresponde.
export default function MemberPinGate({ members, memberId, memberPin, onMemberIdChange, onPinChange, label }: Props) {
  if (members.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="text-xs text-cream/50 mb-2">{label ?? '¿Quién sos? Necesitamos tu PIN para confirmar.'}</p>
      <div className="flex gap-2">
        <select
          value={memberId}
          onChange={(e) => onMemberIdChange(e.target.value ? Number(e.target.value) : '')}
          className="flex-1 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/40"
        >
          <option value="">Seleccioná tu nombre...</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input
          value={memberPin}
          onChange={(e) => onPinChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Tu PIN"
          inputMode="numeric"
          className="w-28 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
        />
      </div>
    </div>
  );
}

export function isMemberPinMissing(members: SellerMember[], memberId: number | '', memberPin: string): boolean {
  return members.length > 0 && (memberId === '' || !/^\d{4,6}$/.test(memberPin));
}
