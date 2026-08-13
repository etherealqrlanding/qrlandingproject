import { useState } from 'react';
import { sellerApi, SellerApiError, type SellerMember } from '../../lib/sellerApi';
import DetailRow from '../DetailRow';
import SimpleSelect from '../SimpleSelect';
import { getLastMemberId, setLastMemberId } from '../../lib/lastMember';

interface Props {
  publicId: string;
  currentName: string | null;
  members: SellerMember[];
  paymentMethod: string;
  // Identidad ya validada para esta orden (ver OrderMemberGate) — si el miembro
  // elegido acá coincide con quien ya se identificó, no hace falta pedir el PIN
  // de nuevo. Si se elige a alguien distinto, sigue pidiendo el PIN de esa persona.
  unlockedMember?: { memberId: number; pin: string } | null;
  onMemberValidated?: (memberId: number, pin: string) => void;
  // Idem para cuando ya se validó como administrador (aplica siempre en Mercado
  // Pago/PIX, y en efectivo cuando se usa el override de abajo).
  unlockedAdminPin?: string | null;
  onAdminValidated?: (pin: string) => void;
  onSaved: () => void;
  // Nombre de quien ya pidió (con su propio PIN) que se le sume esta venta, si hay un
  // reclamo sin resolver — ver requestOrderAttribution. Mientras esté pendiente no se
  // ofrece reclamarla de nuevo (el admin la aprueba/rechaza desde el panel de arriba).
  pendingRequestMemberName?: string | null;
  onClaimed?: () => void;
  // Modo abierto (sellers.team_pin_required = false): asignar/reasignar es un simple
  // select, sin pedir ningún PIN — ni propio ni de administrador. Default true para
  // no romper a nadie que no pasa el prop.
  pinRequired?: boolean;
}

// Fila editable "¿quién de mi equipo cerró esta venta?" dentro del detalle de una
// orden — permite tag-ear (o corregir) después de creada. Quién autoriza depende
// del medio de pago: en efectivo, la persona que toma la orden entra su PROPIO PIN
// (igual que al cobrar); en Mercado Pago/PIX — o al limpiar la atribución, sea cual
// sea el medio — nadie se identificó en persona, así que lo autoriza el PIN de
// administrador del vendedor.
export default function AttributionPicker({
  publicId, currentName, members, paymentMethod, unlockedMember, onMemberValidated, unlockedAdminPin, onAdminValidated, onSaved,
  pendingRequestMemberName, onClaimed, pinRequired = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMemberId, setClaimMemberId] = useState<number | ''>('');
  const [claimPin, setClaimPin] = useState('');
  const [claimSaving, setClaimSaving] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<number | ''>('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // En efectivo, por defecto es un auto-tag (la persona elegida entra su propio PIN).
  // El admin puede forzar el PIN de administrador en su lugar — por ejemplo para
  // corregir una venta que no cerró la persona que quedó marcada — y esa corrección
  // queda anotada en el historial de la orden como hecha por el administrador.
  const [useAdminOverride, setUseAdminOverride] = useState(false);

  const isCash = paymentMethod === 'cash';
  // Ya identificado para esta orden de una forma que alcanza para esta acción: en
  // efectivo, el auto-tag propio también cuenta; si no, solo sirve el de admin.
  const alreadyIdentified = unlockedAdminPin != null || (isCash && unlockedMember != null);

  if (members.length === 0 && !currentName) return null;

  const resetClaimForm = () => {
    setClaiming(false);
    setClaimPin('');
    setClaimMemberId('');
    setClaimError(null);
  };

  const handleClaim = async () => {
    setClaimError(null);
    if (claimMemberId === '') return setClaimError('Elegí quién sos.');
    if (!/^\d{4,6}$/.test(claimPin)) return setClaimError('Ingresá tu PIN (4-6 dígitos).');
    setClaimSaving(true);
    try {
      await sellerApi.requestOrderAttribution(publicId, claimMemberId, claimPin);
      resetClaimForm();
      onClaimed?.();
    } catch (err) {
      setClaimError((err as SellerApiError).message);
    } finally {
      setClaimSaving(false);
    }
  };

  const needsAdminPin = paymentMethod !== 'cash' || memberId === '' || useAdminOverride;
  const canSkipMemberPin = !needsAdminPin && unlockedMember != null && memberId === unlockedMember.memberId;
  const canSkipAdminPin = needsAdminPin && unlockedAdminPin != null;
  const canSkipPin = canSkipMemberPin || canSkipAdminPin;

  const resetForm = () => {
    setEditing(false);
    setPin('');
    setMemberId('');
    setUseAdminOverride(false);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    if (!pinRequired) {
      setSaving(true);
      try {
        await sellerApi.setOrderAttributionOpen(publicId, memberId === '' ? null : memberId);
        setLastMemberId(memberId === '' ? null : memberId);
        resetForm();
        onSaved();
      } catch (err) {
        setError((err as SellerApiError).message);
      } finally {
        setSaving(false);
      }
      return;
    }
    const effectivePin = canSkipMemberPin ? unlockedMember!.pin : canSkipAdminPin ? unlockedAdminPin! : pin;
    if (!/^\d{4,6}$/.test(effectivePin)) {
      setError(needsAdminPin ? 'Ingresá el PIN de administrador (4-6 dígitos).' : 'Ingresá tu PIN (4-6 dígitos).');
      return;
    }
    setSaving(true);
    try {
      await sellerApi.setOrderAttribution(publicId, memberId === '' ? null : memberId, effectivePin, needsAdminPin ? 'admin' : 'member');
      if (!needsAdminPin && !canSkipMemberPin) onMemberValidated?.(memberId, effectivePin);
      if (needsAdminPin && !canSkipAdminPin) onAdminValidated?.(effectivePin);
      resetForm();
      onSaved();
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setSaving(false);
    }
  };

  if (claiming) {
    return (
      <div className="flex flex-col gap-1.5 py-1" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-cream/50">¿Quién la vendió?</span>
        <span className="text-[10px] text-cream/30">
          Con tu PIN quedás anotado como quien la cerró — el administrador todavía tiene que confirmarlo.
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <SimpleSelect
            size="sm"
            className="w-40"
            value={claimMemberId === '' ? '' : String(claimMemberId)}
            onChange={(v) => setClaimMemberId(v === '' ? '' : Number(v))}
            options={[
              { value: '', label: '— Elegí —' },
              ...members.map((m) => ({ value: String(m.id), label: m.name })),
            ]}
          />
          <input
            value={claimPin}
            onChange={(e) => setClaimPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Tu PIN"
            inputMode="numeric"
            className="w-24 rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          <button
            type="button"
            onClick={handleClaim}
            disabled={claimSaving}
            className="rounded-md bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
          >
            ✓
          </button>
          <button type="button" onClick={resetClaimForm} className="text-xs text-cream/40 hover:text-cream/70 transition">✕</button>
        </div>
        {claimError && <p className="text-[10px] text-bordeaux-light">⚠ {claimError}</p>}
      </div>
    );
  }

  if (!editing) {
    return (
      <DetailRow label="Atendido por">
        <span className="text-cream/80">
          {currentName ?? (pendingRequestMemberName ? `Reclamo pendiente de aprobar (${pendingRequestMemberName})` : 'Sin especificar')}
        </span>
        {/* Autoreclamo: solo tiene sentido en equipos con PIN (pedir+aprobar). En modo
            abierto no hace falta — "asignar/cambiar" de abajo ya es sin fricción. */}
        {pinRequired && members.length > 0 && !currentName && !pendingRequestMemberName && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setClaiming(true); }}
            className="ml-2 text-[10px] text-gold-soft hover:text-gold transition underline underline-offset-2"
          >
            ¿es tuya?
          </button>
        )}
        {/* Si la orden ya está identificada de una forma que alcanza para esta
            acción, no tiene sentido pedir de nuevo un select+PIN acá — para
            reasignar hay que "cambiar" primero arriba (relock) y volver a
            identificarse. En modo abierto no hay nada que identificar, así que
            siempre está disponible. */}
        {members.length > 0 && (!pinRequired || !alreadyIdentified) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // Modo abierto: precarga el último elegido en este dispositivo, para no
              // tener que volver a buscarlo en el select cada vez durante el turno.
              if (!pinRequired) {
                const last = getLastMemberId();
                if (last != null && members.some((m) => m.id === last)) setMemberId(last);
              }
              setEditing(true);
            }}
            className="ml-2 text-[10px] text-gold-soft hover:text-gold transition underline underline-offset-2"
          >
            {currentName ? 'cambiar' : 'asignar'}
          </button>
        )}
      </DetailRow>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-1" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-cream/50">Atendido por</span>
      {pinRequired && !canSkipPin && (
        <span className="text-[10px] text-cream/30">
          {needsAdminPin
            ? 'Esta venta no tuvo a nadie identificándose en el momento, así que la asigna quien tiene el PIN de administrador.'
            : 'Confirmá con tu propio PIN — no es una contraseña, solo queda registrado quién cerró la venta.'}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <SimpleSelect
          size="sm"
          className="w-40"
          value={memberId === '' ? '' : String(memberId)}
          onChange={(v) => setMemberId(v === '' ? '' : Number(v))}
          options={[
            { value: '', label: '— Sin especificar —' },
            ...members.map((m) => ({ value: String(m.id), label: m.name })),
          ]}
        />
        {pinRequired && !canSkipPin && (
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={needsAdminPin ? 'PIN de administrador' : 'Tu PIN'}
            inputMode="numeric"
            className="w-28 rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="text-xs text-cream/40 hover:text-cream/70 transition"
        >
          ✕
        </button>
      </div>
      {pinRequired && paymentMethod === 'cash' && memberId !== '' && !canSkipPin && (
        <button
          type="button"
          onClick={() => setUseAdminOverride((v) => !v)}
          className="self-start text-[10px] text-cream/40 hover:text-cream/70 transition underline underline-offset-2"
        >
          {useAdminOverride ? 'usar el PIN de esa persona' : '¿sos admin y esa persona no está? usar PIN de administrador'}
        </button>
      )}
      {error && <p className="text-[10px] text-bordeaux-light">⚠ {error}</p>}
    </div>
  );
}
