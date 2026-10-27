import { useRef } from 'react';
import { normalizeBullets } from '../../lib/pasteText';
import CharCounter from './CharCounter';

interface Props {
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows?: number;
  className?: string;
}

/**
 * Textarea para descripciones: sin maxLength (que corta el pegado en
 * silencio) pero con contador que se pone rojo; el formulario bloquea el
 * guardado con un mensaje claro. Al pegar unifica las viñetas a "• " (el
 * sitio público respeta los saltos de línea).
 */
export default function LimitedTextarea({ value, onChange, max, rows, className = 'input' }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const el = e.currentTarget;
    const pasted = normalizeBullets(text);
    const next = value.slice(0, el.selectionStart) + pasted + value.slice(el.selectionEnd);
    const caret = el.selectionStart + pasted.length;
    onChange(next);
    // El valor es controlado: el caret hay que reponerlo después del re-render.
    requestAnimationFrame(() => ref.current?.setSelectionRange(caret, caret));
  };

  return (
    <>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        className={`${className} ${value.length > max ? '!border-bordeaux-light' : ''}`}
      />
      <div className="mt-1 text-right"><CharCounter count={value.length} max={max} /></div>
    </>
  );
}
