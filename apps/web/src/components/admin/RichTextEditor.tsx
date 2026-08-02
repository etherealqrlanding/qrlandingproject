import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/**
 * Editor de texto enriquecido minimalista (negrita, subrayado, lista) sobre
 * un <div contentEditable>, sin librería externa — alcanza para el caso de
 * uso (el admin pega texto de un PDF y lo formatea un poco). Es un componente
 * no controlado: el HTML solo se vuelca al montar, después el DOM manda (si
 * React reescribiera innerHTML en cada tecla, el cursor saltaría al inicio).
 */
export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && ref.current) {
      ref.current.innerHTML = value || '';
      initialized.current = true;
    }
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML ?? '');

  const exec = (command: string) => {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  };

  return (
    <div className="rounded-md border border-gold/30 bg-ink overflow-hidden focus-within:border-gold/60 transition">
      <div className="flex items-center gap-1 border-b border-gold/15 bg-ink-soft/60 px-2 py-1.5">
        <ToolbarButton label="Negrita" onMouseDown={() => exec('bold')}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton label="Cursiva" onMouseDown={() => exec('italic')}>
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton label="Subrayado" onMouseDown={() => exec('underline')}>
          <span className="underline">S</span>
        </ToolbarButton>
        <ToolbarButton label="Lista" onMouseDown={() => exec('insertUnorderedList')}>
          <span aria-hidden>≡</span>
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className="min-h-[200px] max-h-[480px] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-cream/90 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 empty:before:content-[attr(data-placeholder)] empty:before:text-cream/30"
      />
    </div>
  );
}

export function ToolbarButton({ label, onMouseDown, children }: {
  label: string; onMouseDown: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // preventDefault: si no, el click le saca el foco/selección al editor
      // antes de que document.execCommand tenga sobre qué texto aplicar.
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      className="h-7 w-8 flex items-center justify-center rounded text-xs text-cream/70 hover:bg-gold/10 hover:text-gold transition"
    >
      {children}
    </button>
  );
}
