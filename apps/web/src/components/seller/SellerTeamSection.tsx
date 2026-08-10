import { useEffect, useState } from 'react';
import { sellerApi, SellerApiError, type SellerMemberStats } from '../../lib/sellerApi';

function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

type RowAction = { id: number; kind: 'pin' | 'toggle' | 'forgot' } | null;

// Autogestión de "mi equipo": sub-vendedores (ej. conserjes de un hotel) que venden
// bajo mi mismo código/QR. No tienen login propio — solo un PIN corto para firmar,
// al cargar o cobrar una venta, quién de adentro del equipo la cerró. Es trazabilidad
// interna: no cambia mi comisión ni mi liquidación con el operador.
//
// Dos niveles de permiso sobre esta sección, ambos por PIN (nunca por sesión):
//  - Crear a alguien nuevo, o activar/desactivar a alguien: exige el PIN de
//    administrador (lo carga el equipo/soporte, no es autogestionable).
//  - Cambiar el propio PIN o nombre: cualquiera puede hacerlo con SU PROPIO PIN
//    actual — o también con el PIN de administrador si lo tiene a mano.
export default function SellerTeamSection() {
  const [members, setMembers] = useState<SellerMemberStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [rowAction, setRowAction] = useState<RowAction>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowSuccess, setRowSuccess] = useState<string | null>(null);
  // Editar (PIN y/o email): un solo campo de autorización — el backend acepta ahí
  // tanto el PIN propio del registro como el de administrador, lo que sea que se ingrese.
  const [authPin, setAuthPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [editEmail, setEditEmail] = useState('');
  // Activar/desactivar: solo vale el PIN de administrador.
  const [toggleAdminPin, setToggleAdminPin] = useState('');
  // Olvidé mi PIN: confirmar el email para pedir el link de reset por su cuenta.
  const [forgotEmail, setForgotEmail] = useState('');

  const load = () => {
    sellerApi.members.stats()
      .then(setMembers)
      .catch((err) => setError((err as SellerApiError).message));
  };

  useEffect(load, []);

  const closeRowAction = () => {
    setRowAction(null);
    setRowError(null);
    setRowSuccess(null);
    setAuthPin('');
    setNewPin('');
    setEditEmail('');
    setToggleAdminPin('');
    setForgotEmail('');
  };

  const handleAdd = async () => {
    setAddError(null);
    if (name.trim().length < 2) return setAddError('Ingresá un nombre.');
    if (!/^\d{4,6}$/.test(pin)) return setAddError('El PIN debe tener entre 4 y 6 dígitos.');
    if (!/^\d{4,6}$/.test(adminPin)) return setAddError('Ingresá el PIN de administrador para agregar a alguien.');
    setSaving(true);
    try {
      await sellerApi.members.create(name.trim(), pin, adminPin, email.trim() || undefined);
      setName('');
      setPin('');
      setEmail('');
      setAdminPin('');
      setShowAdd(false);
      load();
    } catch (err) {
      setAddError((err as SellerApiError).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (m: SellerMemberStats) => {
    if (!/^\d{4,6}$/.test(toggleAdminPin)) return setRowError('Ingresá el PIN de administrador.');
    setBusyId(m.id);
    try {
      await sellerApi.members.update(m.id, { is_active: !m.is_active, admin_pin: toggleAdminPin });
      closeRowAction();
      load();
    } catch (err) {
      setRowError((err as SellerApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleEditMember = async (m: SellerMemberStats) => {
    const trimmedEmail = editEmail.trim();
    const emailChanged = trimmedEmail !== (m.email ?? '');
    if (!newPin && !emailChanged) return setRowError('Cambiá el PIN y/o el email antes de guardar.');
    if (newPin && !/^\d{4,6}$/.test(newPin)) return setRowError('El nuevo PIN debe tener entre 4 y 6 dígitos.');

    // Cargar el email por primera vez (todavía no tenía ninguno) no pide PIN — es el
    // paso que habilita después el self-service de "olvidé mi PIN" sin depender del
    // PIN de administrador. Cualquier otro cambio (PIN, nombre, o cambiar un email
    // que ya existía) sigue pidiendo el gate de siempre.
    const settingEmailFirstTime = !m.email && emailChanged && trimmedEmail !== '' && !newPin;
    if (!settingEmailFirstTime && !/^\d{4,6}$/.test(authPin)) {
      return setRowError('Ingresá tu PIN actual, o el PIN de administrador.');
    }

    setBusyId(m.id);
    try {
      // Mandamos el mismo valor como los dos candidatos posibles de autorización — el
      // backend valida cuál de los dos (si alguno) corresponde.
      await sellerApi.members.update(m.id, {
        ...(newPin ? { pin: newPin } : {}),
        ...(emailChanged ? { email: trimmedEmail || null } : {}),
        ...(settingEmailFirstTime ? {} : { admin_pin: authPin, current_pin: authPin }),
      });
      closeRowAction();
      load();
    } catch (err) {
      setRowError((err as SellerApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleForgotPin = async (m: SellerMemberStats) => {
    setRowError(null);
    if (!forgotEmail.trim()) return setRowError('Ingresá el email.');
    setBusyId(m.id);
    try {
      await sellerApi.members.forgotPin(m.id, forgotEmail.trim());
      setRowSuccess('Listo — si el email coincide, le va a llegar un link para elegir un PIN nuevo.');
    } catch (err) {
      setRowError((err as SellerApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs uppercase tracking-widest text-gold-soft">Mi equipo</h2>
        <button
          type="button"
          onClick={() => { setShowAdd((v) => !v); setAddError(null); }}
          className="text-xs text-gold-soft hover:text-gold transition underline underline-offset-2"
        >
          {showAdd ? 'Cancelar' : '+ Agregar persona'}
        </button>
      </div>
      <p className="text-cream/50 text-xs mb-4">
        Si trabajás con más gente bajo tu mismo código (ej. conserjes), cargalos acá para que cada uno pueda
        firmar con su PIN qué venta cerró. No es un login — solo queda registrado en la venta para tu propio control.
        Cada quien puede cambiar su propio PIN ingresándolo; agregar gente nueva o activar/desactivar requiere el
        PIN de administrador (te lo damos nosotros).
      </p>

      {showAdd && (
        <div className="mb-4 rounded-xl border border-gold/20 bg-ink-soft/40 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              maxLength={60}
              className="flex-1 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
            />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Su PIN (4-6 dígitos)"
              inputMode="numeric"
              className="sm:w-40 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
            />
          </div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email (opcional — para que pueda resetear su PIN solo)"
            maxLength={160}
            className="w-full rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          <input
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="PIN de administrador"
            inputMode="numeric"
            className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          {addError && <p className="text-xs text-bordeaux-light">⚠ {addError}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-bordeaux-light">{error}</p>}

      {members == null && !error && (
        <div className="space-y-2">
          {['a', 'b'].map((k) => <div key={k} className="h-14 rounded-lg bg-ink-soft/40 animate-pulse" />)}
        </div>
      )}

      {members != null && members.length === 0 && (
        <div className="rounded-xl border border-gold/10 bg-ink-soft/20 p-6 text-center text-cream/40 text-sm">
          Todavía no cargaste a nadie de tu equipo.
        </div>
      )}

      {members != null && members.length > 0 && (
        <div className="space-y-2">
          {members.map((m) => {
            const isOpen = rowAction?.id === m.id;
            return (
              <div key={m.id} className="rounded-xl border border-gold/10 bg-ink-soft/30 p-3.5">
                <div className="sm:flex sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-cream text-sm font-medium truncate">{m.name}</p>
                      {!m.is_active && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] border border-cream/15 bg-cream/5 text-cream/40">Inactivo</span>
                      )}
                    </div>
                    <p className="text-xs text-cream/45 mt-0.5">
                      {m.orders_paid} venta{m.orders_paid !== 1 ? 's' : ''}
                      {m.orders_paid > 0 && <> · {fmtArs(m.revenue_paid_ars)}</>}
                    </p>
                    {m.email && <p className="text-[11px] text-cream/30 truncate">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-2 mt-2 sm:mt-0 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (isOpen && rowAction?.kind === 'pin') { closeRowAction(); return; }
                        setRowAction({ id: m.id, kind: 'pin' });
                        setRowError(null);
                        setAuthPin('');
                        setNewPin('');
                        setEditEmail(m.email ?? '');
                      }}
                      className="text-xs text-gold-soft hover:text-gold transition underline underline-offset-2"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isOpen && rowAction?.kind === 'toggle') { closeRowAction(); return; }
                        setRowAction({ id: m.id, kind: 'toggle' });
                        setRowError(null);
                        setToggleAdminPin('');
                      }}
                      className="rounded-lg border border-gold/20 px-2.5 py-1.5 text-xs text-cream/60 hover:border-gold/40 transition"
                    >
                      {m.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    {m.email && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isOpen && rowAction?.kind === 'forgot') { closeRowAction(); return; }
                          setRowAction({ id: m.id, kind: 'forgot' });
                          setRowError(null);
                          setRowSuccess(null);
                          setForgotEmail('');
                        }}
                        className="text-xs text-cream/40 hover:text-cream/70 transition underline underline-offset-2"
                      >
                        ¿Olvidó su PIN?
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && rowAction?.kind === 'pin' && (() => {
                  const settingEmailFirstTime = !m.email && editEmail.trim() !== '' && !newPin;
                  return (
                  <div className="mt-3 pt-3 border-t border-gold/10 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Nuevo PIN (opcional)"
                        inputMode="numeric"
                        autoFocus
                        className="w-full sm:w-40 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                      />
                      <input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        type="email"
                        placeholder="Email (opcional)"
                        className="flex-1 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                      />
                    </div>
                    {!m.email && (
                      <p className="text-[10px] text-cream/35">
                        {settingEmailFirstTime
                          ? 'Como todavía no tiene email cargado, esto se guarda sin pedir PIN.'
                          : 'Cargarle un email por primera vez no pide PIN.'}
                      </p>
                    )}
                    {!settingEmailFirstTime && (
                      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <input
                          value={authPin}
                          onChange={(e) => setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Tu PIN actual (o el de administrador)"
                          inputMode="numeric"
                          className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditMember(m)}
                          disabled={busyId === m.id}
                          className="rounded-lg bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
                        >
                          ✓
                        </button>
                        <button type="button" onClick={closeRowAction} className="text-xs text-cream/40 hover:text-cream/70 transition">✕</button>
                    </div>
                  </div>
                  );
                })()}

                {isOpen && rowAction?.kind === 'toggle' && (
                  <div className="mt-3 pt-3 border-t border-gold/10 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <input
                      value={toggleAdminPin}
                      onChange={(e) => setToggleAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="PIN de administrador"
                      inputMode="numeric"
                      autoFocus
                      className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(m)}
                        disabled={busyId === m.id}
                        className="rounded-lg bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
                      >
                        {m.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button type="button" onClick={closeRowAction} className="text-xs text-cream/40 hover:text-cream/70 transition">✕</button>
                    </div>
                  </div>
                )}

                {isOpen && rowAction?.kind === 'forgot' && (
                  <div className="mt-3 pt-3 border-t border-gold/10">
                    {!rowSuccess ? (
                      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <input
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          type="email"
                          placeholder="Confirmá su email"
                          autoFocus
                          className="w-full sm:w-64 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleForgotPin(m)}
                            disabled={busyId === m.id}
                            className="rounded-lg bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
                          >
                            Enviar
                          </button>
                          <button type="button" onClick={closeRowAction} className="text-xs text-cream/40 hover:text-cream/70 transition">✕</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-400">✓ {rowSuccess}</p>
                    )}
                  </div>
                )}

                {isOpen && rowError && (
                  <p className="text-[10px] text-bordeaux-light mt-2">⚠ {rowError}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
