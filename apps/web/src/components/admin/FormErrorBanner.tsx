import { useEffect, useRef } from 'react';

interface Props {
  messages: string[] | null;
  onDismiss?: () => void;
}

/**
 * Banner de errores dentro del formulario (reemplaza los alert()). Lista cada
 * problema con el nombre del campo y se desplaza a la vista cuando aparece,
 * porque el botón de guardar suele quedar lejos del campo con el error.
 */
export default function FormErrorBanner({ messages, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const key = messages?.join('|') ?? '';

  useEffect(() => {
    if (key) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [key]);

  if (!messages || messages.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/90 flex items-start justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="font-medium text-bordeaux-light">
          {messages.length === 1 ? 'No se pudo guardar:' : `No se pudo guardar (${messages.length} problemas):`}
        </p>
        {messages.length === 1 ? (
          <p className="mt-0.5">{messages[0]}</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {messages.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="shrink-0 text-cream/50 hover:text-cream"
        >
          ✕
        </button>
      )}
    </div>
  );
}
