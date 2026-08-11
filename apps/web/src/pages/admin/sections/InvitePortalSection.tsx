import { useState } from 'react';
import { adminApi, AdminApiError, type AdminSeller } from '../../../lib/adminApi';
import Spinner from '../../../components/Spinner';

interface Props {
  seller: AdminSeller;
  onUpdated: (s: AdminSeller) => void;
}

export default function InvitePortalSection({ seller, onUpdated }: Readonly<Props>) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<{ sent: boolean; error: string | null } | null>(null);

  const hasAccount = Boolean(seller.supabase_user_id);
  const hasEmail = Boolean(seller.contact_email);
  const buttonLabel = hasAccount ? 'Reenviar acceso' : 'Invitar al portal';

  const handleInvite = async () => {
    if (!hasEmail) return;
    const action = hasAccount ? 'reenviar el acceso' : 'invitar';
    if (!confirm(`¿${action} a ${seller.contact_email}?`)) return;

    setLoading(true);
    setLink(null);
    setError(null);
    setCopied(false);
    setEmailStatus(null);
    try {
      const data = await adminApi.sellers.invite(seller.id);
      setLink(data.link);
      setEmailStatus({ sent: data.email_sent, error: data.email_error });
      if (data.action === 'invite_sent') {
        const updated = await adminApi.sellers.get(seller.id);
        onUpdated(updated);
      }
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="rounded-xl border border-gold/10 bg-ink-soft/30 p-5 mt-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-cream/90 mb-1">Portal del recomendador</p>
          {hasAccount ? (
            <p className="text-xs text-emerald-400">
              ✓ Cuenta activa — puede iniciar sesión en{' '}
              <span className="font-mono">/seller/login</span>
            </p>
          ) : (
            <p className="text-xs text-cream/50">
              Sin acceso al portal todavía.
              {!hasEmail && ' Agregá un email de contacto para poder invitarlo.'}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleInvite}
          disabled={loading || !hasEmail}
          className="btn-ghost text-sm disabled:opacity-40 whitespace-nowrap"
        >
          {loading ? <><Spinner size="sm" className="mr-2" />Generando...</> : buttonLabel}
        </button>
      </div>

      {emailStatus && (
        emailStatus.sent ? (
          <p className="mt-4 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-md px-3 py-2">
            ✓ Email enviado a {seller.contact_email}. Igual podés compartir el link de abajo por las dudas.
          </p>
        ) : (
          <p className="mt-4 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/30 rounded-md px-3 py-2">
            ⚠ El link se generó pero <strong>el email no se pudo enviar</strong>{emailStatus.error ? ` (${emailStatus.error})` : ''}. Compartí el link de abajo manualmente (WhatsApp, etc.).
          </p>
        )
      )}

      {link && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-cream/60">
            {hasAccount
              ? 'Link de acceso generado. Compartilo con el recomendador (WhatsApp, email, etc.):'
              : 'Invitación generada. Compartí este link con el recomendador:'}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={link}
              className="input font-mono text-xs flex-1 min-w-0"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="btn-ghost text-xs whitespace-nowrap px-3 py-2"
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-cream/30">
            {hasAccount
              ? 'Este link expira en 1 hora.'
              : 'Este link expira en 24 horas. Solo puede usarse una vez.'}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-bordeaux-light bg-bordeaux-deep/20 border border-bordeaux-light/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
