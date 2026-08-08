import { useEffect, useState } from 'react';
import { sellerApi, SellerApiError, type SellerMemberStats } from '../../lib/sellerApi';

function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

type RowAction = { id: number; kind: 'pin' | 'toggle' } | null;

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
  const [adminPin, setAdminPin] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [rowAction, setRowAction] = useState<RowAction>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // Cambiar PIN/nombre: un solo campo de autorización — el backend acepta ahí tanto
  // el PIN propio del registro como el de administrador, lo que sea que se ingrese.
  const [authPin, setAuthPin] = useState('');
  const [newPin, setNewPin] = useState('');
  // Activar/desactivar: solo vale el PIN de administrador.
  const [toggleAdminPin, setToggleAdminPin] = useState('');

  const load = () => {
    sellerApi.members.stats()
      .then(setMembers)
      .catch((err) => setError((err as SellerApiError).message));
  };

  useEffect(load, []);

  const closeRowAction = () => {
    setRowAction(null);
    setRowError(null);
    setAuthPin('');
    setNewPin('');
    setToggleAdminPin('');
  };

  const handleAdd = async () => {
    setAddError(null);
    if (name.trim().length < 2) return setAddError('Ingresá un nombre.');
    if (!/^\d{4,6}$/.test(pin)) return setAddError('El PIN debe tener entre 4 y 6 dígitos.');
    if (!/^\d{4,6}$/.test(adminPin)) return setAddError('Ingresá el PIN de administrador para agregar a alguien.');
    setSaving(true);
    try {
      await sellerApi.members.create(name.trim(), pin, adminPin);
      setName('');
      setPin('');
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

  const handleChangePin = async (id: number) => {
    if (!/^\d{4,6}$/.test(newPin)) return setRowError('El nuevo PIN debe tener entre 4 y 6 dígitos.');
    if (!/^\d{4,6}$/.test(authPin)) return setRowError('Ingresá tu PIN actual, o el PIN de administrador.');
    setBusyId(id);
    try {
      // Mandamos el mismo valor como los dos candidatos posibles — el backend valida
      // cuál de los dos (si alguno) corresponde.
      await sellerApi.members.update(id, { pin: newPin, admin_pin: authPin, current_pin: authPin });
      closeRowAction();
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
                      }}
                      className="text-xs text-gold-soft hover:text-gold transition underline underline-offset-2"
                    >
                      Cambiar PIN
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
                  </div>
                </div>

                {isOpen && rowAction?.kind === 'pin' && (
                  <div className="mt-3 pt-3 border-t border-gold/10 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    <input
                      value={authPin}
                      onChange={(e) => setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Tu PIN actual (o el de administrador)"
                      inputMode="numeric"
                      autoFocus
                      className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                    />
                    <input
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Nuevo PIN"
                      inputMode="numeric"
                      className="w-28 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleChangePin(m.id)}
                        disabled={busyId === m.id}
                        className="rounded-lg bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
                      >
                        ✓
                      </button>
                      <button type="button" onClick={closeRowAction} className="text-xs text-cream/40 hover:text-cream/70 transition">✕</button>
                    </div>
                  </div>
                )}

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
