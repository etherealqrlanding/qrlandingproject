import { useEffect, useRef, useState } from 'react';
import { parsePastedLines, pastedTextToHtml } from '../../lib/pasteText';
import CharCounter from './CharCounter';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Límite del servidor sobre el HTML guardado; muestra contador y lo pone rojo al pasarse. */
  maxLength?: number;
}

/**
 * Editor de texto enriquecido minimalista (negrita, subrayado, lista) sobre
 * un <div contentEditable>, sin librería externa — alcanza para el caso de
 * uso (el admin pega texto de un PDF y lo formatea un poco). Es un componente
 * no controlado: el HTML solo se vuelca al montar, después el DOM manda (si
 * React reescribiera innerHTML en cada tecla, el cursor saltaría al inicio).
 *
 * Pegado: se usa solo el texto plano. Las líneas con viñeta/numeración
 * ("•", "-", "1.") se vuelven una lista real (un <li> por línea); varias
 * líneas sin viñeta quedan como párrafos. Así lo que viene de Word/PDF/web
 * no arrastra estilos ni listas anidadas.
 */
export default function RichTextEditor({ value, onChange, placeholder, maxLength }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [length, setLength] = useState(value.length);

  useEffect(() => {
    if (!initialized.current && ref.current) {
      ref.current.innerHTML = value || '';
      initialized.current = true;
    }
  }, [value]);

  const emit = () => {
    const html = ref.current?.innerHTML ?? '';
    setLength(html.length);
    onChange(html);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const html = pastedTextToHtml(text);
    if (html === null) {
      // Una sola línea sin viñeta: texto plano en el cursor.
      const line = parsePastedLines(text).lines[0] ?? '';
      if (line) document.execCommand('insertText', false, line);
    } else {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const base = node instanceof HTMLElement ? node : node?.parentElement;
      if (base?.closest('li')) {
        // Dentro de una lista: ítems hermanos, no una lista anidada.
        parsePastedLines(text).lines.forEach((line, i) => {
          if (i > 0) document.execCommand('insertParagraph');
          document.execCommand('insertText', false, line);
        });
      } else {
        document.execCommand('insertHTML', false, html);
      }
    }
    emit();
  };

  const exec = (command: string) => {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  };

  const over = maxLength != null && length > maxLength;

  return (
    <div>
      <div className={`rounded-md border bg-ink overflow-hidden focus-within:border-gold/60 transition ${over ? 'border-bordeaux-light/60' : 'border-gold/30'}`}>
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
          onPaste={handlePaste}
          data-placeholder={placeholder}
          className="min-h-[200px] max-h-[480px] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-cream/90 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 empty:before:content-[attr(data-placeholder)] empty:before:text-cream/30"
        />
      </div>
      {maxLength != null && (
        <div className="mt-1 text-right"><CharCounter count={length} max={maxLength} /></div>
      )}
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
