import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminSeller, type AdminSellerMember } from '../../../lib/adminApi';
import { useAdminAuth } from '../../../hooks/useAdminAuth';

interface Props {
  seller: AdminSeller;
  onUpdated: (s: AdminSeller) => void;
  // Opcionales: si vienen, cada fila del roster suma un botón para filtrar las
  // tarjetas de estadísticas de más abajo directo a esa persona.
  selectedMemberId?: number | null;
  onSelectMember?: (memberId: number) => void;
}

function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

function waUrl(phone: string, name: string) {
  const digits = phone.replace(/\D/g, '');
  const msg = encodeURIComponent(`Hola ${name}, te contacto desde Tango QR.`);
  return `https://wa.me/${digits}?text=${msg}`;
}

function WaButton({ phone, name }: Readonly<{ phone: string; name: string }>) {
  return (
    <a
      href={waUrl(phone, name)}
      target="_blank"
      rel="noopener noreferrer"
      title={`WhatsApp a ${name}`}
      className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366]/15 border border-[#25D366]/30 px-2.5 py-1 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/25 transition-colors whitespace-nowrap"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current shrink-0" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      WhatsApp
    </a>
  );
}

// PIN de administrador de "Mi equipo" (sub-vendedores) del vendedor — lo cargamos
// nosotros acá, nunca el vendedor. Sin este PIN el vendedor no puede crear ni editar
// a nadie de su equipo en el portal (solo puede autogestionar su propio PIN, si ya
// tiene equipo cargado). Ver requireMemberIfTeamExists / routes/seller/members.ts.
// Tanto esto como el blanqueo de PIN de un sub-vendedor puntual son operaciones
// sensibles (dan acceso a firmar ventas a nombre de otro) — el backend las restringe
// a rol super_admin; acá replicamos el gate para no mostrar un botón que va a fallar.
export default function TeamAdminPinSection({ seller, onUpdated, selectedMemberId, onSelectMember }: Readonly<Props>) {
  const { me } = useAdminAuth();
  const isSuperAdmin = me?.admin.role === 'super_admin';
  // Modo abierto (team_pin_required=false): ni el PIN de administrador ni el de los
  // sub-recomendadores se usan para nada (ver requireMemberIfTeamExists/
  // resolveMemberOrAdmin en el backend) — configurar o blanquear un PIN acá sería una
  // acción sin ningún efecto real, así que las deshabilitamos y avisamos por qué.
  const pinRequired = seller.team_pin_required ?? true;
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
            Habilita al recomendador a crear y editar sub-recomendadores (ej. conserjes) en su portal, en "Mi Equipo".
            Sin este PIN, solo puede ver a su equipo, no darlo de alta ni activar/desactivar a nadie.
          </p>
          {!seller.team_enabled && (
            <p className="mt-2 text-xs text-amber-400">
              "Mi equipo" está deshabilitado para esta cuenta — activá "Habilitar 'Mi equipo' (sub-recomendadores)" arriba para que el recomendador pueda usarlo.
            </p>
          )}
          {seller.team_enabled && !pinRequired && (
            <p className="mt-2 text-xs text-amber-400">
              Esta cuenta opera en "modo abierto" (sin PIN) — el PIN de administrador no se usa para nada mientras esté así.
              Activá "El equipo opera con PIN" en Datos para poder configurarlo o restablecerlo.
            </p>
          )}
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
          <button
            type="button"
            onClick={() => { setEditing(true); setError(null); setPin(''); }}
            disabled={!pinRequired}
            title={pinRequired ? undefined : 'La cuenta tiene que operar con PIN para configurar esto'}
            className="btn-ghost text-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
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

        {seller.team_enabled && !pinRequired && (
          <p className="text-xs text-amber-400 mb-3">
            Esta cuenta opera en "modo abierto" — el PIN de cada sub-recomendador no se usa, así que no hay nada que blanquear.
          </p>
        )}

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
              <div
                key={m.id}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  selectedMemberId === m.id ? 'border-gold/50 bg-gold/5' : 'border-gold/10 bg-ink/30'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-cream/85 truncate">{m.name}</span>
                      {!m.is_active && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] border border-cream/15 bg-cream/5 text-cream/40">Inactivo</span>
                      )}
                    </div>
                    {m.phone && <p className="text-[11px] text-cream/35 truncate">📞 {m.phone}</p>}
                    {m.email && <p className="text-[11px] text-cream/35 truncate">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-cream/45">
                      {m.orders_paid} venta{m.orders_paid !== 1 ? 's' : ''}
                      {m.orders_paid > 0 && <> · {fmtArs(m.revenue_paid_ars)}</>}
                    </span>
                    {onSelectMember && (
                      <button
                        type="button"
                        onClick={() => onSelectMember(m.id)}
                        disabled={selectedMemberId === m.id}
                        title="Ver sus estadísticas"
                        className="text-[11px] text-gold-soft hover:text-gold transition underline underline-offset-2 disabled:no-underline disabled:text-gold disabled:cursor-default"
                      >
                        {selectedMemberId === m.id ? '✓ Viendo' : '📊 Ver stats'}
                      </button>
                    )}
                    {m.phone && <WaButton phone={m.phone} name={m.name} />}
                    {isSuperAdmin && resetResult?.id !== m.id && (
                      <button
                        type="button"
                        onClick={() => { setResetTarget(resetTarget === m.id ? null : m.id); setResetError(null); }}
                        disabled={!pinRequired}
                        title={pinRequired ? undefined : 'La cuenta tiene que operar con PIN para blanquear esto'}
                        className="text-[11px] text-cream/40 hover:text-cream/70 transition underline underline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-cream/40"
                      >
                        Blanquear PIN
                      </button>
                    )}
                  </div>
                </div>

                {resetTarget === m.id && resetResult?.id !== m.id && (
                  <div className="mt-2 pt-2 border-t border-gold/10 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11px] text-amber-400 max-w-sm">
                      Le genera un PIN nuevo al toque, sin avisarle — el actual deja de funcionar. Usalo solo si {m.name} quedó bloqueado (perdió su PIN y no tiene email cargado, o no responde el recomendador).
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
