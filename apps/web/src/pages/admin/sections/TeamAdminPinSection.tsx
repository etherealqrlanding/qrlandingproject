import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSeller, type AdminSellerMember } from '../../../lib/adminApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';

interface Props {
  seller: AdminSeller;
  onUpdated: (s: AdminSeller) => void;
}

function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

// PIN de administrador de "Mi equipo" (sub-vendedores) del vendedor — lo cargamos
// nosotros acá, nunca el vendedor. Sin este PIN el vendedor no puede crear ni editar
// a nadie de su equipo en el portal (solo puede autogestionar su propio PIN, si ya
// tiene equipo cargado). Ver requireMemberIfTeamExists / routes/seller/members.ts.
// Tanto esto como el blanqueo de PIN de un sub-vendedor puntual son operaciones
// sensibles (dan acceso a firmar ventas a nombre de otro) — el backend las restringe
// a rol super_admin; acá replicamos el gate para no mostrar un botón que va a fallar.
export default function TeamAdminPinSection({ seller, onUpdated }: Readonly<Props>) {
  const { me } = useAdminAuth();
  const isSuperAdmin = me?.admin.role === 'super_admin';
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [members, setMembers] = useState<AdminSellerMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<number | null>(null);
  const [resetBusyId, setResetBusyId] = useState<number | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ id: number; pin: string } | null>(null);

  useEffect(() => {
    adminApi.sellers.members(seller.id)
      .then(setMembers)
      .catch((err) => setMembersError((err as AdminApiError).message));
  }, [seller.id]);

  const handleSave = async () => {
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) return setError('El PIN debe tener entre 4 y 6 dígitos.');
    setSaving(true);
    try {
      await adminApi.sellers.setAdminPin(seller.id, pin);
      setEditing(false);
      setPin('');
      setDone(true);
      onUpdated({ ...seller, has_admin_pin: true });
      setTimeout(() => setDone(false), 2500);
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetMemberPin = async (memberId: number) => {
    setResetBusyId(memberId);
    setResetError(null);
    try {
      const result = await adminApi.sellers.resetMemberPin(seller.id, memberId);
      setResetResult({ id: memberId, pin: result.pin });
      setResetTarget(null);
    } catch (err) {
      setResetError((err as AdminApiError).message);
    } finally {
      setResetBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-5 mt-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-cream/90 mb-1">PIN de administrador — Mi equipo</p>
          <p className="text-xs text-cream/50 max-w-md">
            Habilita al vendedor a crear y editar sub-vendedores (ej. conserjes) en su portal, en "Configuración → Mi equipo".
            Sin este PIN, solo puede ver a su equipo, no darlo de alta ni activar/desactivar a nadie.
          </p>
          {seller.has_admin_pin ? (
            <p className="mt-2 text-xs text-emerald-400">✓ Ya tiene un PIN configurado.</p>
          ) : (
            <p className="mt-2 text-xs text-amber-400">Todavía no tiene PIN de administrador.</p>
          )}
          {!isSuperAdmin && (
            <p className="mt-2 text-[11px] text-cream/35">Solo un super_admin puede configurar o restablecer este PIN.</p>
          )}
        </div>
        {!editing && isSuperAdmin && (
          <button type="button" onClick={() => { setEditing(true); setError(null); setPin(''); }} className="btn-ghost text-sm whitespace-nowrap">
            {seller.has_admin_pin ? 'Restablecer PIN' : 'Configurar PIN'}
          </button>
        )}
      </div>

      {editing && isSuperAdmin && (
        <div className="mt-4 flex items-center gap-2">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Nuevo PIN (4-6 dígitos)"
            inputMode="numeric"
            autoFocus
            className="input font-mono max-w-[200px]"
          />
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-sm">Cancelar</button>
        </div>
      )}

      {done && <p className="mt-3 text-xs text-emerald-400">✓ PIN actualizado.</p>}
      {error && (
        <p className="mt-3 text-xs text-bordeaux-light bg-bordeaux-deep/20 border border-bordeaux-light/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* Equipo cargado — solo lectura, lo autogestiona el vendedor desde su portal */}
      <div className="mt-5 pt-5 border-t border-gold/10">
        <p className="text-xs uppercase tracking-widest text-gold-soft mb-3">Su equipo</p>

        {membersError && <p className="text-xs text-bordeaux-light">{membersError}</p>}

        {members == null && !membersError && (
          <div className="space-y-2">
            {['a', 'b'].map((k) => <div key={k} className="h-10 rounded-lg bg-ink/30 animate-pulse" />)}
          </div>
        )}

        {members != null && members.length === 0 && (
          <p className="text-xs text-cream/40">Todavía no cargó a nadie en su equipo.</p>
        )}

        {members != null && members.length > 0 && (
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.id} className="rounded-lg border border-gold/10 bg-ink/30 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-cream/85 truncate">{m.name}</span>
                      {!m.is_active && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] border border-cream/15 bg-cream/5 text-cream/40">Inactivo</span>
                      )}
                    </div>
                    {m.email && <p className="text-[11px] text-cream/35 truncate">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-cream/45">
                      {m.orders_paid} venta{m.orders_paid !== 1 ? 's' : ''}
                      {m.orders_paid > 0 && <> · {fmtArs(m.revenue_paid_ars)}</>}
                    </span>
                    {isSuperAdmin && resetResult?.id !== m.id && (
                      <button
                        type="button"
                        onClick={() => { setResetTarget(resetTarget === m.id ? null : m.id); setResetError(null); }}
                        className="text-[11px] text-cream/40 hover:text-cream/70 transition underline underline-offset-2"
                      >
                        Blanquear PIN
                      </button>
                    )}
                  </div>
                </div>

                {resetTarget === m.id && resetResult?.id !== m.id && (
                  <div className="mt-2 pt-2 border-t border-gold/10 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11px] text-amber-400 max-w-sm">
                      Le genera un PIN nuevo al toque, sin avisarle — el actual deja de funcionar. Usalo solo si {m.name} quedó bloqueado (perdió su PIN y no tiene email cargado, o no responde el vendedor).
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResetMemberPin(m.id)}
                        disabled={resetBusyId === m.id}
                        className="rounded-lg bg-amber-500/90 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-amber-500 transition disabled:opacity-50"
                      >
                        {resetBusyId === m.id ? 'Generando...' : 'Confirmar blanqueo'}
                      </button>
                      <button type="button" onClick={() => setResetTarget(null)} className="text-xs text-cream/40 hover:text-cream/70 transition">Cancelar</button>
                    </div>
                  </div>
                )}

                {resetResult?.id === m.id && (
                  <div className="mt-2 pt-2 border-t border-gold/10">
                    <p className="text-xs text-emerald-400">
                      ✓ PIN nuevo para {m.name}: <span className="font-mono text-sm text-cream tracking-widest">{resetResult.pin}</span>
                    </p>
                    <p className="text-[11px] text-cream/40 mt-1">Comunicáselo vos — no se le avisa por ningún otro medio. No se vuelve a mostrar.</p>
                    <button type="button" onClick={() => setResetResult(null)} className="mt-1 text-[11px] text-cream/40 hover:text-cream/70 transition underline underline-offset-2">Listo</button>
                  </div>
                )}
              </div>
            ))}
            {resetError && (
              <p className="text-xs text-bordeaux-light bg-bordeaux-deep/20 border border-bordeaux-light/30 rounded-md px-3 py-2">{resetError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
