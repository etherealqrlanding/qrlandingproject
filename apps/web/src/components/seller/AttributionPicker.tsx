import { useState } from 'react';
import { sellerApi, SellerApiError, type SellerMember } from '../../lib/sellerApi';
import DetailRow from '../DetailRow';

interface Props {
  publicId: string;
  currentName: string | null;
  members: SellerMember[];
  onSaved: () => void;
}

// Fila editable "¿quién de mi equipo cerró esta venta?" dentro del detalle de una
// orden — permite tag-ear (o corregir) después de creada, típicamente para ventas
// online (Mercado Pago) donde nadie del equipo tocó el sistema al momento de vender.
export default function AttributionPicker({ publicId, currentName, members, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [memberId, setMemberId] = useState<number | ''>('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (members.length === 0 && !currentName) return null;

  const handleSave = async () => {
    setError(null);
    if (memberId !== '' && !/^\d{4,6}$/.test(pin)) {
      setError('Ingresá el PIN (4-6 dígitos).');
      return;
    }
    setSaving(true);
    try {
      await sellerApi.setOrderAttribution(publicId, memberId === '' ? null : memberId, memberId === '' ? undefined : pin);
      setEditing(false);
      setPin('');
      setMemberId('');
      onSaved();
    } catch (err) {
      setError((err as SellerApiError).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <DetailRow label="Atendido por">
        <span className="text-cream/80">{currentName ?? 'Sin especificar'}</span>
        {members.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
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
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')}
          className="rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs text-cream focus:outline-none focus:border-gold/40"
        >
          <option value="">— Sin especificar —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {memberId !== '' && (
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="PIN"
            inputMode="numeric"
            className="w-20 rounded-md border border-gold/20 bg-ink/60 px-2 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
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
          onClick={() => { setEditing(false); setError(null); }}
          className="text-xs text-cream/40 hover:text-cream/70 transition"
        >
          ✕
        </button>
      </div>
      {error && <p className="text-[10px] text-bordeaux-light">⚠ {error}</p>}
    </div>
  );
}
