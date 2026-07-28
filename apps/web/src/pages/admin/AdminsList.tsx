import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AdminUserRow } from '../../lib/adminApi';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const ROLE_LABELS: Record<AdminUserRow['role'], string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  operator: 'Operador',
};

function RoleBadge({ role }: Readonly<{ role: AdminUserRow['role'] }>) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
        role === 'super_admin'
          ? 'border-gold/40 text-gold bg-gold/10'
          : 'border-cream/20 text-cream/70 bg-cream/5'
      }`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

function InviteModal({
  onClose, onInvited,
}: Readonly<{ onClose: () => void; onInvited: (result: AdminUserRow) => void }>) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AdminUserRow['role']>('admin');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await adminApi.admins.invite({
        email: email.trim().toLowerCase(),
        full_name: fullName.trim() || null,
        role,
      });
      if (!result.email_sent) {
        setNotice(
          `Se agregó como ${ROLE_LABELS[role]}, pero no se pudo enviar el email automático` +
          (result.email_error ? ` (${result.email_error})` : '') +
          '. Copiá y mandale este link a mano: ' + result.link,
        );
        onInvited(result.admin);
        return;
      }
      onInvited(result.admin);
      onClose();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'No se pudo invitar. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm animate-modal-backdrop">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="relative w-full max-w-md rounded-2xl bg-ink-soft border border-gold/20 p-7 animate-modal-panel">
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="absolute right-4 top-4 h-9 w-9 rounded-full bg-ink/60 text-cream hover:bg-ink transition"
          >
            ×
          </button>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Panel de administración</p>
          <h2 className="mt-2 mb-5 font-display text-2xl text-cream">Invitar admin</h2>

          {notice ? (
            <div className="space-y-4">
              <div className="rounded-md border border-gold/30 bg-gold/5 p-3 text-sm text-cream/90 break-all">
                {notice}
              </div>
              <button type="button" onClick={onClose} className="btn-primary w-full">Listo</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="block text-sm text-cream/80 mb-1.5">Email</span>
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@email.com" className="input"
                />
              </label>
              <label className="block">
                <span className="block text-sm text-cream/80 mb-1.5">Nombre (opcional)</span>
                <input
                  type="text" value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nombre y apellido" className="input"
                />
              </label>
              <label className="block">
                <span className="block text-sm text-cream/80 mb-1.5">Rol</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AdminUserRow['role'])}
                  className="input"
                >
                  <option value="admin">Admin — CRUD de productos, ventas y vendedores</option>
                  <option value="operator">Operador — solo lectura + estados de órdenes</option>
                  <option value="super_admin">Super admin — acceso total, incluido gestionar admins</option>
                </select>
              </label>

              {error && <p className="text-sm text-bordeaux-light">{error}</p>}

              <p className="text-xs text-cream/40">
                Si el email ya existe (por ejemplo, es también vendedor), no se crea una cuenta
                nueva: se le agrega el acceso a la misma cuenta y se le manda un link para
                confirmar el acceso.
              </p>

              <button type="submit" disabled={saving || !email.trim()} className="btn-primary w-full disabled:opacity-50">
                {saving ? 'Invitando...' : 'Invitar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminsList() {
  const { me } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    adminApi.admins.list()
      .then(setAdmins)
      .catch((err) => setError((err as Error).message));
  };

  useEffect(load, []);

  const handleRoleChange = async (admin: AdminUserRow, role: AdminUserRow['role']) => {
    setBusyId(admin.id);
    setError(null);
    try {
      const updated = await adminApi.admins.update(admin.id, { role });
      setAdmins((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'No se pudo cambiar el rol.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (admin: AdminUserRow) => {
    setBusyId(admin.id);
    setError(null);
    try {
      const updated = await adminApi.admins.update(admin.id, { is_active: !admin.is_active });
      setAdmins((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4 md:mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft">Panel administrativo</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl text-cream">Admins</h1>
        </div>
        <button type="button" onClick={() => setShowInvite(true)} className="btn-primary text-sm">
          + Invitar admin
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 mb-4">{error}</div>
      )}

      {!admins && !error && (
        <div className="space-y-3">
          {['sk-a', 'sk-b'].map((k) => (
            <div key={k} className="h-14 rounded-xl bg-ink-soft/60 animate-pulse" />
          ))}
        </div>
      )}

      {admins && admins.length > 0 && (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {admins.map((a) => {
              const isSelf = a.id === me?.admin.id;
              return (
                <div key={a.id} className="rounded-xl border border-gold/10 bg-ink-soft/40 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-cream text-sm font-medium truncate">{a.full_name ?? a.email}</p>
                      <p className="text-xs text-cream/40 truncate">{a.email}</p>
                    </div>
                    <RoleBadge role={a.role} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <select
                      value={a.role}
                      disabled={isSelf || busyId === a.id}
                      onChange={(e) => handleRoleChange(a, e.target.value as AdminUserRow['role'])}
                      className="input text-xs py-1.5 disabled:opacity-40"
                    >
                      <option value="admin">Admin</option>
                      <option value="operator">Operador</option>
                      <option value="super_admin">Super admin</option>
                    </select>
                    <button
                      type="button"
                      disabled={isSelf || busyId === a.id}
                      onClick={() => handleToggleActive(a)}
                      className={`text-xs whitespace-nowrap disabled:opacity-40 ${a.is_active ? 'text-cream/60 hover:text-bordeaux-light' : 'text-gold-soft hover:text-gold'}`}
                    >
                      {a.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                  {isSelf && <p className="mt-2 text-[10px] text-cream/30">Sos vos — cambiá tu perfil desde otra cuenta super_admin.</p>}
                </div>
              );
            })}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block rounded-lg border border-gold/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-soft/60 text-cream/60 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2.5 px-3">Nombre</th>
                  <th className="text-left py-2.5 px-3">Email</th>
                  <th className="text-left py-2.5 px-3">Rol</th>
                  <th className="text-left py-2.5 px-3">Último login</th>
                  <th className="text-center py-2.5 px-3">Estado</th>
                  <th className="text-right py-2.5 px-3" />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const isSelf = a.id === me?.admin.id;
                  return (
                    <tr key={a.id} className="border-t border-gold/5 hover:bg-gold/5">
                      <td className="py-2.5 px-3 text-cream text-xs">
                        {a.full_name ?? '—'}
                        {isSelf && <span className="ml-1.5 text-[10px] text-cream/30">(vos)</span>}
                      </td>
                      <td className="py-2.5 px-3 text-cream/70 text-xs">{a.email}</td>
                      <td className="py-2.5 px-3">
                        <select
                          value={a.role}
                          disabled={isSelf || busyId === a.id}
                          onChange={(e) => handleRoleChange(a, e.target.value as AdminUserRow['role'])}
                          className="input text-xs py-1 disabled:opacity-40"
                        >
                          <option value="admin">Admin</option>
                          <option value="operator">Operador</option>
                          <option value="super_admin">Super admin</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-cream/50 text-xs whitespace-nowrap">
                        {a.last_login_at ? new Date(a.last_login_at).toLocaleString('es-AR') : 'Nunca'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {a.is_active
                          ? <span className="text-xs text-gold">Activo</span>
                          : <span className="text-xs text-cream/40">Inactivo</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          disabled={isSelf || busyId === a.id}
                          onClick={() => handleToggleActive(a)}
                          className="text-xs text-gold-soft hover:text-gold disabled:opacity-40 whitespace-nowrap"
                        >
                          {a.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={(admin) => setAdmins((prev) => {
            if (!prev) return [admin];
            const exists = prev.some((a) => a.id === admin.id);
            return exists ? prev.map((a) => (a.id === admin.id ? admin : a)) : [...prev, admin];
          })}
        />
      )}
    </div>
  );
}
