import { useEffect, useState } from 'react';
import Spinner from './Spinner';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Cuerpo del cartel. Puede ser texto o JSX (lista de consecuencias, etc.). */
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo rojo de acción destructiva (default true). */
  danger?: boolean;
  /**
   * Si se define, el usuario debe escribir exactamente este texto para habilitar el botón.
   * Pensado para borrados irreversibles (ej: el nombre del recurso o "ELIMINAR").
   */
  requireText?: string;
  /** Muestra spinner y deshabilita los botones mientras se procesa. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  danger = true,
  requireText,
  loading = false,
  onConfirm,
  onCancel,
}: Readonly<ConfirmDialogProps>) {
  const [typed, setTyped] = useState('');

  // Reseteamos el texto cada vez que se abre/cierra para no arrastrar valores viejos.
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const textOk = !requireText || typed.trim() === requireText.trim();
  const confirmDisabled = loading || !textOk;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => { if (!loading) onCancel(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-bordeaux-light/30 bg-ink-soft shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 text-2xl ${danger ? 'text-bordeaux-light' : 'text-gold'}`} aria-hidden>
              {danger ? '⚠' : 'ℹ'}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl text-cream">{title}</h2>
              <div className="mt-2 text-sm text-cream/70 space-y-2">{message}</div>
            </div>
          </div>

          {requireText && (
            <label className="mt-4 block">
              <span className="block text-xs text-cream/50 mb-1.5">
                Para confirmar, escribí <span className="font-mono text-cream/80">{requireText}</span>
              </span>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={loading}
                autoFocus
                className="input"
                placeholder={requireText}
              />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/5 px-6 py-4">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`inline-flex items-center justify-center px-5 py-2.5 rounded-md text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? 'bg-bordeaux-light text-cream hover:bg-bordeaux-light/85'
                : 'bg-gold text-ink hover:bg-gold-soft'
            }`}
          >
            {loading && <Spinner size="sm" className="mr-2" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
