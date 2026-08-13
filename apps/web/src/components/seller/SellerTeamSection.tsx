import { useEffect, useState } from 'react';
import { sellerApi, SellerApiError, type SellerMemberStats, type SellerAdminPinInfo } from '../../lib/sellerApi';
import { useSellerAuth } from '../../hooks/useSellerAuth';
import Collapse from '../Collapse';

function fmtArs(n: number) {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

// Mismo criterio que el backend: sacando todo lo que no sea dígito, tiene que quedar
// un número de largo internacional válido (8-15 dígitos) — es lo que después usa el
// botón de WhatsApp del admin (wa.me/<dígitos>).
function isValidWhatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

type RowAction = { id: number; kind: 'pin' | 'toggle' | 'forgot' | 'delete' } | null;

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
  const { me } = useSellerAuth();
  // Modo abierto (sellers.team_pin_required = false): nadie pide ni usa PIN acá —
  // ni el propio de cada persona, ni el de administrador. Default true mientras
  // carga `me`, para no mostrar por un instante una UI sin PIN en una cuenta que sí
  // lo requiere.
  const pinRequired = me?.team_pin_required ?? true;
  const [members, setMembers] = useState<SellerMemberStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  // El email es el canal de recuperación si se pierde el PIN — pedimos confirmarlo
  // (sin poder pegarlo) para no cargar uno mal tipeado y que la persona quede sin
  // forma de resetear su PIN sola el día que lo necesite.
  const [emailConfirm, setEmailConfirm] = useState('');
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
  const [editEmailConfirm, setEditEmailConfirm] = useState('');
  const [editPhone, setEditPhone] = useState('');
  // Activar/desactivar: solo vale el PIN de administrador.
  const [toggleAdminPin, setToggleAdminPin] = useState('');
  // Olvidé mi PIN: confirmar el email para pedir el link de reset por su cuenta.
  const [forgotEmail, setForgotEmail] = useState('');
  // Eliminar (borrado real, no desactivar): solo vale el PIN de administrador, y
  // solo si la persona nunca tuvo ventas atribuidas (el backend es quien lo garantiza).
  const [deletePin, setDeletePin] = useState('');

  // ── ADMIN de la cuenta: el PIN que gatea alta/edición/borrado de todo el equipo.
  // Autogestión con el PIN actual; si lo perdió del todo y ya tiene email cargado,
  // puede pedir el reset por link (igual que un sub-vendedor con su propio PIN).
  const [adminInfo, setAdminInfo] = useState<SellerAdminPinInfo | null>(null);
  const [adminInfoError, setAdminInfoError] = useState<string | null>(null);
  const [adminEditing, setAdminEditing] = useState(false);
  const [adminNewPin, setAdminNewPin] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminEmailConfirm, setAdminEmailConfirm] = useState('');
  const [adminCurrentPin, setAdminCurrentPin] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminSaveError, setAdminSaveError] = useState<string | null>(null);
  const [adminSaveSuccess, setAdminSaveSuccess] = useState(false);
  // Olvidé el PIN de administrador: confirmar el email para pedir el link de reset.
  const [adminForgotOpen, setAdminForgotOpen] = useState(false);
  const [adminForgotEmail, setAdminForgotEmail] = useState('');
  const [adminForgotBusy, setAdminForgotBusy] = useState(false);
  const [adminForgotError, setAdminForgotError] = useState<string | null>(null);
  const [adminForgotSuccess, setAdminForgotSuccess] = useState<string | null>(null);

  const load = () => {
    sellerApi.members.stats()
      .then(setMembers)
      .catch((err) => setError((err as SellerApiError).message));
  };

  const loadAdminInfo = () => {
    sellerApi.adminPin.get()
      .then(setAdminInfo)
      .catch((err) => setAdminInfoError((err as SellerApiError).message));
  };

  useEffect(load, []);
  useEffect(loadAdminInfo, []);

  const closeRowAction = () => {
    setRowAction(null);
    setRowError(null);
    setRowSuccess(null);
    setAuthPin('');
    setNewPin('');
    setEditEmail('');
    setEditEmailConfirm('');
    setEditPhone('');
    setToggleAdminPin('');
    setForgotEmail('');
    setDeletePin('');
  };

  const openAdminEdit = () => {
    setAdminEditing(true);
    setAdminSaveError(null);
    setAdminNewPin('');
    setAdminEmail(adminInfo?.email ?? '');
    setAdminEmailConfirm(adminInfo?.email ?? '');
    setAdminCurrentPin('');
  };

  const closeAdminEdit = () => {
    setAdminEditing(false);
    setAdminSaveError(null);
    setAdminNewPin('');
    setAdminEmail('');
    setAdminEmailConfirm('');
    setAdminCurrentPin('');
  };

  const handleSaveAdminPin = async () => {
    if (!adminInfo) return;
    const trimmedEmail = adminEmail.trim();
    const emailChanged = trimmedEmail !== (adminInfo.email ?? '');
    if (!adminNewPin && !emailChanged) return setAdminSaveError('Cambiá el PIN y/o el email antes de guardar.');
    if (adminNewPin && !/^\d{4,6}$/.test(adminNewPin)) return setAdminSaveError('El nuevo PIN debe tener entre 4 y 6 dígitos.');
    if (emailChanged && trimmedEmail !== '' && trimmedEmail.toLowerCase() !== adminEmailConfirm.trim().toLowerCase()) {
      return setAdminSaveError('El email y su confirmación no coinciden.');
    }

    const settingEmailFirstTime = !adminInfo.email && emailChanged && trimmedEmail !== '' && !adminNewPin;
    if (!settingEmailFirstTime && !/^\d{4,6}$/.test(adminCurrentPin)) {
      return setAdminSaveError('Ingresá el PIN de administrador actual.');
    }

    setAdminSaving(true);
    setAdminSaveError(null);
    try {
      const updated = await sellerApi.adminPin.update({
        ...(adminNewPin ? { pin: adminNewPin } : {}),
        ...(emailChanged ? { email: trimmedEmail || null } : {}),
        ...(settingEmailFirstTime ? {} : { current_pin: adminCurrentPin }),
      });
      setAdminInfo(updated);
      closeAdminEdit();
      setAdminSaveSuccess(true);
      setTimeout(() => setAdminSaveSuccess(false), 2500);
    } catch (err) {
      setAdminSaveError((err as SellerApiError).message);
    } finally {
      setAdminSaving(false);
    }
  };

  const openAdminForgot = () => {
    setAdminForgotOpen(true);
    setAdminForgotError(null);
    setAdminForgotSuccess(null);
    setAdminForgotEmail('');
  };

  const closeAdminForgot = () => {
    setAdminForgotOpen(false);
    setAdminForgotError(null);
    setAdminForgotEmail('');
  };

  const handleAdminForgotPin = async () => {
    setAdminForgotError(null);
    if (!adminForgotEmail.trim()) return setAdminForgotError('Ingresá el email.');
    setAdminForgotBusy(true);
    try {
      await sellerApi.adminPin.forgotPin(adminForgotEmail.trim());
      setAdminForgotSuccess('Listo — si el email coincide, te va a llegar un link para elegir un PIN nuevo.');
    } catch (err) {
      setAdminForgotError((err as SellerApiError).message);
    } finally {
      setAdminForgotBusy(false);
    }
  };

  const handleAdd = async () => {
    setAddError(null);
    if (name.trim().length < 2) return setAddError('Ingresá un nombre.');
    if (!isValidWhatsappPhone(phone)) return setAddError('Ingresá un teléfono con WhatsApp válido, con código de país (ej: +54 9 11 1234-5678).');
    if (email.trim() !== '' && email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
      return setAddError('El email y su confirmación no coinciden.');
    }
    if (pinRequired) {
      if (!/^\d{4,6}$/.test(pin)) return setAddError('El PIN debe tener entre 4 y 6 dígitos.');
      if (!/^\d{4,6}$/.test(adminPin)) return setAddError('Ingresá el PIN de administrador para agregar a alguien.');
    }
    setSaving(true);
    try {
      await sellerApi.members.create(name.trim(), phone.trim(), pinRequired ? pin : undefined, pinRequired ? adminPin : undefined, email.trim() || undefined);
      setName('');
      setPhone('');
      setPin('');
      setEmail('');
      setEmailConfirm('');
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
    if (pinRequired && !/^\d{4,6}$/.test(toggleAdminPin)) return setRowError('Ingresá el PIN de administrador.');
    setBusyId(m.id);
    try {
      await sellerApi.members.update(m.id, { is_active: !m.is_active, ...(pinRequired ? { admin_pin: toggleAdminPin } : {}) });
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
    const trimmedPhone = editPhone.trim();
    const phoneChanged = trimmedPhone !== (m.phone ?? '');
    if (!newPin && !emailChanged && !phoneChanged) return setRowError('Cambiá el PIN, el email y/o el teléfono antes de guardar.');
    if (newPin && !/^\d{4,6}$/.test(newPin)) return setRowError('El nuevo PIN debe tener entre 4 y 6 dígitos.');
    if (emailChanged && trimmedEmail !== '' && trimmedEmail.toLowerCase() !== editEmailConfirm.trim().toLowerCase()) {
      return setRowError('El email y su confirmación no coinciden.');
    }
    if (phoneChanged && trimmedPhone === '') return setRowError('El teléfono no puede quedar vacío.');
    if (phoneChanged && !isValidWhatsappPhone(trimmedPhone)) return setRowError('Ingresá un teléfono con WhatsApp válido, con código de país (ej: +54 9 11 1234-5678).');

    // Cargar el email por primera vez (todavía no tenía ninguno) no pide PIN — es el
    // paso que habilita después el self-service de "olvidé mi PIN" sin depender del
    // PIN de administrador. Cualquier otro cambio (PIN, nombre, teléfono, o cambiar un
    // email que ya existía) sigue pidiendo el gate de siempre. En modo abierto,
    // directamente no hay PIN que pedir nunca.
    const settingEmailFirstTime = !m.email && emailChanged && trimmedEmail !== '' && !newPin && !phoneChanged;
    if (pinRequired && !settingEmailFirstTime && !/^\d{4,6}$/.test(authPin)) {
      return setRowError('Ingresá tu PIN actual, o el PIN de administrador.');
    }

    setBusyId(m.id);
    try {
      // Mandamos el mismo valor como los dos candidatos posibles de autorización — el
      // backend valida cuál de los dos (si alguno) corresponde.
      await sellerApi.members.update(m.id, {
        ...(newPin ? { pin: newPin } : {}),
        ...(emailChanged ? { email: trimmedEmail || null } : {}),
        ...(phoneChanged ? { phone: trimmedPhone } : {}),
        ...(pinRequired && !settingEmailFirstTime ? { admin_pin: authPin, current_pin: authPin } : {}),
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

  const handleDeleteMember = async (m: SellerMemberStats) => {
    if (pinRequired && !/^\d{4,6}$/.test(deletePin)) return setRowError('Ingresá el PIN de administrador.');
    setBusyId(m.id);
    try {
      await sellerApi.members.delete(m.id, pinRequired ? deletePin : undefined);
      closeRowAction();
      load();
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
        {pinRequired ? (
          <>
            Si trabajás con más gente bajo tu mismo código (ej. conserjes), cargalos acá para que cada uno pueda
            firmar con su PIN qué venta cerró. No es un login — solo queda registrado en la venta para tu propio control.
            Cada quien puede cambiar su propio PIN ingresándolo; agregar gente nueva, activar/desactivar o eliminar
            requiere el PIN de administrador (te lo damos nosotros).
          </>
        ) : (
          <>
            Si trabajás con más gente bajo tu mismo código (ej. conserjes), cargalos acá para que después puedan
            marcar entre ustedes quién cerró cada venta. No es un login ni pide PIN — cualquiera con acceso a esta
            cuenta puede agregar, editar o dar de baja a alguien.
          </>
        )}
      </p>

      {/* ── ADMIN de la cuenta: el PIN que gatea el resto de estas operaciones — solo
          existe (y tiene sentido mostrarlo) en equipos que operan con PIN. ── */}
      {pinRequired && (
      <div className="mb-4 rounded-xl border border-gold/25 bg-ink-soft/40 p-3.5">
        <div className="sm:flex sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider border border-gold/40 bg-gold/10 text-gold-soft">ADMIN</span>
              <p className="text-cream text-sm font-medium">Administrador de la cuenta</p>
            </div>
            {adminInfoError && <p className="text-xs text-bordeaux-light mt-1">{adminInfoError}</p>}
            {adminInfo && (
              <p className="text-xs text-cream/45 mt-0.5">
                {adminInfo.has_admin_pin ? 'PIN configurado' : 'Sin PIN configurado — contactanos para activarlo'}
                {adminInfo.email && <> · {adminInfo.email}</>}
              </p>
            )}
          </div>
          {adminInfo?.has_admin_pin && !adminEditing && (
            <div className="flex items-center gap-3 mt-2 sm:mt-0 shrink-0">
              <button
                type="button"
                onClick={openAdminEdit}
                className="text-xs text-gold-soft hover:text-gold transition underline underline-offset-2"
              >
                Editar
              </button>
              {adminInfo.email && !adminForgotOpen && (
                <button
                  type="button"
                  onClick={openAdminForgot}
                  className="text-xs text-cream/40 hover:text-cream/70 transition underline underline-offset-2"
                >
                  ¿Olvidaste el PIN?
                </button>
              )}
            </div>
          )}
        </div>

        {adminForgotOpen && (
          <Collapse className="mt-3 pt-3 border-t border-gold/10">
            {!adminForgotSuccess ? (
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <input
                  value={adminForgotEmail}
                  onChange={(e) => setAdminForgotEmail(e.target.value)}
                  type="email"
                  placeholder="Confirmá el email"
                  autoFocus
                  className="w-full sm:w-64 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAdminForgotPin}
                    disabled={adminForgotBusy}
                    className="rounded-lg bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
                  >
                    Enviar
                  </button>
                  <button type="button" onClick={closeAdminForgot} className="text-xs text-cream/40 hover:text-cream/70 transition">✕</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-emerald-400">✓ {adminForgotSuccess}</p>
            )}
            {adminForgotError && <p className="text-[10px] text-bordeaux-light mt-2">⚠ {adminForgotError}</p>}
          </Collapse>
        )}

        {adminEditing && (() => {
          const settingEmailFirstTime = !adminInfo?.email && adminEmail.trim() !== '' && !adminNewPin;
          return (
            <Collapse className="mt-3 pt-3 border-t border-gold/10 space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={adminNewPin}
                  onChange={(e) => setAdminNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Nuevo PIN (opcional)"
                  inputMode="numeric"
                  autoFocus
                  className="w-full sm:w-40 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                />
                <input
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  type="email"
                  placeholder="Email (opcional)"
                  className="flex-1 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                />
              </div>
              {adminEmail.trim() !== '' && adminEmail.trim() !== (adminInfo?.email ?? '') && (
                <input
                  value={adminEmailConfirm}
                  onChange={(e) => setAdminEmailConfirm(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  type="email"
                  placeholder="Confirmar email"
                  autoComplete="off"
                  className="w-full rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                />
              )}
              {!adminInfo?.email && (
                <p className="text-[10px] text-cream/35">
                  {settingEmailFirstTime
                    ? 'Como todavía no tiene email cargado, esto se guarda sin pedir PIN.'
                    : 'Cargarle un email por primera vez no pide PIN.'}
                </p>
              )}
              {!settingEmailFirstTime && (
                <input
                  value={adminCurrentPin}
                  onChange={(e) => setAdminCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="PIN de administrador actual"
                  inputMode="numeric"
                  className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                />
              )}
              {adminSaveError && <p className="text-[10px] text-bordeaux-light">⚠ {adminSaveError}</p>}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSaveAdminPin}
                  disabled={adminSaving}
                  className="rounded-lg bg-gold px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
                >
                  {adminSaving ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={closeAdminEdit} className="text-xs text-cream/40 hover:text-cream/70 transition">Cancelar</button>
              </div>
            </Collapse>
          );
        })()}

        {adminSaveSuccess && <p className="text-xs text-emerald-400 mt-2">✓ Actualizado.</p>}
      </div>
      )}

      {showAdd && (
        <Collapse className="mb-4 rounded-xl border border-gold/20 bg-ink-soft/40 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              maxLength={60}
              className="flex-1 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
            />
            {pinRequired && (
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Su PIN (4-6 dígitos)"
                inputMode="numeric"
                className="sm:w-40 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
              />
            )}
          </div>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            placeholder="Teléfono (con WhatsApp), ej: +54 9 11 1234-5678"
            maxLength={40}
            className="w-full rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          <p className="text-[11px] text-cream/35 -mt-1.5">
            📱 Es el teléfono con el que te vamos a contactar por WhatsApp si hace falta — asegurate de que sea correcto y tenga WhatsApp activo.
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder={pinRequired ? 'Email (opcional — para que pueda resetear su PIN solo)' : 'Email (opcional)'}
            maxLength={160}
            className="w-full rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
          />
          {email.trim() !== '' && (
            <input
              value={emailConfirm}
              onChange={(e) => setEmailConfirm(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              type="email"
              placeholder="Confirmar email"
              maxLength={160}
              autoComplete="off"
              className="w-full rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
            />
          )}
          {pinRequired && (
            <input
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="PIN de administrador"
              inputMode="numeric"
              className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-3 py-2 text-sm font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
            />
          )}
          {addError && <p className="text-xs text-bordeaux-light">⚠ {addError}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold/90 transition disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </Collapse>
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
                    {m.phone && <p className="text-[11px] text-cream/30 truncate">📞 {m.phone}</p>}
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
                        setEditEmailConfirm(m.email ?? '');
                        setEditPhone(m.phone ?? '');
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
                    {pinRequired && m.email && (
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
                    <button
                      type="button"
                      onClick={() => {
                        if (isOpen && rowAction?.kind === 'delete') { closeRowAction(); return; }
                        setRowAction({ id: m.id, kind: 'delete' });
                        setRowError(null);
                        setDeletePin('');
                      }}
                      className="text-xs text-bordeaux-light/70 hover:text-bordeaux-light transition underline underline-offset-2"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {isOpen && rowAction?.kind === 'pin' && (() => {
                  const settingEmailFirstTime = !m.email && editEmail.trim() !== '' && !newPin;
                  return (
                  <Collapse className="mt-3 pt-3 border-t border-gold/10 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      {pinRequired && (
                        <input
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Nuevo PIN (opcional)"
                          inputMode="numeric"
                          autoFocus
                          className="w-full sm:w-40 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                        />
                      )}
                      <input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        type="email"
                        placeholder="Email (opcional)"
                        autoFocus={!pinRequired}
                        className="flex-1 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                      />
                    </div>
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      type="tel"
                      placeholder="Teléfono (con WhatsApp)"
                      className="w-full rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                    />
                    <p className="text-[10px] text-cream/30">
                      📱 Es el teléfono con el que te contactamos por WhatsApp si hace falta.
                    </p>
                    {editEmail.trim() !== '' && editEmail.trim() !== (m.email ?? '') && (
                      <input
                        value={editEmailConfirm}
                        onChange={(e) => setEditEmailConfirm(e.target.value)}
                        onPaste={(e) => e.preventDefault()}
                        type="email"
                        placeholder="Confirmar email"
                        autoComplete="off"
                        className="w-full rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                      />
                    )}
                    {pinRequired && !m.email && (
                      <p className="text-[10px] text-cream/35">
                        {settingEmailFirstTime
                          ? 'Como todavía no tiene email cargado, esto se guarda sin pedir PIN.'
                          : 'Cargarle un email por primera vez no pide PIN.'}
                      </p>
                    )}
                    {pinRequired && !settingEmailFirstTime && (
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
                  </Collapse>
                  );
                })()}

                {isOpen && rowAction?.kind === 'toggle' && (
                  <Collapse className="mt-3 pt-3 border-t border-gold/10 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                    {pinRequired && (
                      <input
                        value={toggleAdminPin}
                        onChange={(e) => setToggleAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="PIN de administrador"
                        inputMode="numeric"
                        autoFocus
                        className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                      />
                    )}
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
                  </Collapse>
                )}

                {isOpen && rowAction?.kind === 'forgot' && (
                  <Collapse className="mt-3 pt-3 border-t border-gold/10">
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
                  </Collapse>
                )}

                {isOpen && rowAction?.kind === 'delete' && (
                  <Collapse className="mt-3 pt-3 border-t border-gold/10 space-y-2">
                    <p className="text-[11px] text-bordeaux-light/90">
                      Borra a {m.name} de tu equipo. Si ya tiene ventas registradas, no se va a poder — desactivala en su lugar.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                      {pinRequired && (
                        <input
                          value={deletePin}
                          onChange={(e) => setDeletePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="PIN de administrador"
                          inputMode="numeric"
                          autoFocus
                          className="w-full sm:w-56 rounded-lg border border-gold/20 bg-ink/60 px-2.5 py-1.5 text-xs font-mono text-cream placeholder:text-cream/25 focus:outline-none focus:border-gold/40"
                        />
                      )}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteMember(m)}
                          disabled={busyId === m.id}
                          className="rounded-lg bg-bordeaux-light/90 px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-bordeaux-light transition disabled:opacity-50"
                        >
                          {busyId === m.id ? 'Eliminando...' : 'Confirmar borrado'}
                        </button>
                        <button type="button" onClick={closeRowAction} className="text-xs text-cream/40 hover:text-cream/70 transition">✕</button>
                      </div>
                    </div>
                  </Collapse>
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
