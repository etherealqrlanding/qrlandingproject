import type { SellerMember } from '../../lib/sellerApi';
import SimpleSelect from '../SimpleSelect';

interface Props {
  members: SellerMember[];
  memberId: number | '';
  memberPin: string;
  onMemberIdChange: (id: number | '') => void;
  onPinChange: (pin: string) => void;
  label?: string;
  // Para el override de PIN de administrador: cambia el placeholder del input y el
  // texto del select deja de ser obligatorio (el caller decide si lo valida o no).
  pinPlaceholder?: string;
}

// Bloque "¿quién sos? + tu PIN" reutilizado en toda acción que modifica o cancela una
// orden. Si el vendedor no tiene equipo cargado, no renderiza nada (no le agrega
// fricción a un vendedor individual) — el gate real vive en el backend, esto es solo
// para no dejar confirmar sin completarlo cuando sí corresponde.
export default function MemberPinGate({ members, memberId, memberPin, onMemberIdChange, onPinChange, label, pinPlaceholder }: Props) {
  if (members.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="text-xs text-cream/50 mb-2">{label ?? '¿Quién sos? Necesitamos tu PIN para confirmar.'}</p>
      <div className="flex gap-2">
        <SimpleSelect
          size="sm"
          className="flex-1"
          value={memberId === '' ? '' : String(memberId)}
          onChange={(v) => onMemberIdChange(v === '' ? '' : Number(v))}
          options={[
            { value: '', label: 'Seleccioná tu nombre...' },
            ...members.map((m) => ({ value: String(m.id), label: m.name })),
          ]}
        />
        <input
          value={memberPin}
          onChange={(e) => onPinChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={pinPlaceholder ?? 'Tu PIN'}
          inputMode="numeric"
          className="w-28 rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
        />
      </div>
    </div>
  );
}

export function isMemberPinMissing(members: SellerMember[], memberId: number | '', memberPin: string): boolean {
  return members.length > 0 && (memberId === '' || !/^\d{4,6}$/.test(memberPin));
}
