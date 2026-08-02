import { useEffect, useRef } from 'react';
import { ToolbarButton } from './RichTextEditor';

interface Props {
  items: string[];
  onChange: (items: string[]) => void;
}

/**
 * Editor de la lista "Incluye" de un tier: siempre es una lista (un <li> por
 * ítem), pero el texto de cada ítem admite negrita/cursiva/subrayado. Al ser
 * un <ul contentEditable>, Enter dentro de un <li> crea un <li> nuevo de
 * forma nativa del navegador — eso es lo que se lee de vuelta al guardar
 * (un ítem del array por cada <li>), sin depender de parsear saltos de línea.
 */
export default function IncludesEditor({ items, onChange }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && ref.current) {
      ref.current.innerHTML = items.length > 0
        ? items.map((it) => `<li>${it}</li>`).join('')
        : '<li><br></li>';
      initialized.current = true;
    }
  }, [items]);

  const emit = () => {
    if (!ref.current) return;
    const items = Array.from(ref.current.querySelectorAll('li'))
      .map((li) => li.innerHTML.trim())
      .filter((html) => html && html !== '<br>');
    onChange(items);
  };

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
      </div>
      <ul
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        className="min-h-[110px] max-h-[320px] overflow-y-auto list-disc pl-8 pr-3 py-2.5 text-sm leading-relaxed text-cream/90 focus:outline-none"
      />
    </div>
  );
}
