import { useEffect, useRef, useState } from 'react';
import { ToolbarButton } from './RichTextEditor';
import CharCounter from './CharCounter';
import { parsePastedLines } from '../../lib/pasteText';
import { LIMITS } from '../../lib/formErrors';

interface Props {
  items: string[];
  onChange: (items: string[]) => void;
}

const EMPTY_LIST_HTML = '<li><br></li>';

/** Sin <br> sueltos al final: el navegador los agrega en los <li> vacíos o al borrar. */
const cleanItem = (html: string) => html.replace(/(\s*<br\s*\/?>)+\s*$/i, '').trim();

/**
 * Lee los ítems del <ul> contentEditable. Solo cuenta <li> de primer nivel y
 * aplana los anidados (un <ul> pegado dentro de un <li>) como ítems propios
 * a continuación, así un ítem nunca se duplica (el <li> exterior no incluye
 * el HTML de los interiores). Lo que no sea <li> (un <div> o texto suelto que
 * deja el navegador al borrar) también cuenta como ítem para no perder texto.
 */
function collectItems(list: Element, out: string[]) {
  for (const node of Array.from(list.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = cleanItem((node.textContent ?? '').replace(/</g, '&lt;'));
      if (text) out.push(text);
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      collectItems(node, out);
      continue;
    }
    const clone = node.cloneNode(true) as HTMLElement;
    const nested = Array.from(clone.querySelectorAll(':scope > ul, :scope > ol'));
    nested.forEach((n) => n.remove());
    const html = cleanItem(clone.innerHTML);
    if (html) out.push(html);
    nested.forEach((n) => collectItems(n, out));
  }
}

function readItems(root: HTMLElement): string[] {
  const out: string[] = [];
  collectItems(root, out);
  return out;
}

function itemsToHtml(items: string[]): string {
  return items.length > 0 ? items.map((it) => `<li>${it}</li>`).join('') : EMPTY_LIST_HTML;
}

function placeCaretAtEnd(el: Element) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Editor de la lista "Incluye" de un tier: siempre es una lista (un <li> por
 * ítem), pero el texto de cada ítem admite negrita/cursiva/subrayado. Al ser
 * un <ul contentEditable>, Enter dentro de un <li> crea un <li> nuevo de
 * forma nativa del navegador — eso es lo que se lee de vuelta al guardar
 * (un ítem del array por cada <li>), sin depender de parsear saltos de línea.
 *
 * Pegado: se intercepta y se usa solo el texto plano (una línea = un ítem,
 * sin viñetas ni numeración). El HTML de Word/web trae <ul>, estilos y <span>
 * que ensucian la lista y hacen pasar el límite de 300 caracteres por ítem.
 */
export default function IncludesEditor({ items, onChange }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const initialized = useRef(false);
  const [current, setCurrent] = useState<string[]>(items);

  useEffect(() => {
    if (!initialized.current && ref.current) {
      ref.current.innerHTML = itemsToHtml(items);
      initialized.current = true;
    }
  }, [items]);

  const emit = () => {
    if (!ref.current) return;
    const next = readItems(ref.current);
    setCurrent(next);
    onChange(next);
  };

  /** Si el navegador dejó el editor sin <li> (borrado total), restituye uno vacío. */
  const ensureList = () => {
    const el = ref.current;
    if (!el) return;
    if (!el.querySelector('li')) {
      el.innerHTML = EMPTY_LIST_HTML;
      placeCaretAtEnd(el.firstElementChild as Element);
    }
  };

  const exec = (command: string) => {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  };

  /** Reordena el DOM como lista limpia: un <li> por ítem, partiendo los que tengan saltos <br>. */
  const restructure = () => {
    const el = ref.current;
    if (!el) return;
    const flat = readItems(el).flatMap((html) => html.split(/<br\s*\/?>/i).map(cleanItem).filter(Boolean));
    el.innerHTML = itemsToHtml(flat);
    el.focus();
    placeCaretAtEnd(el.lastElementChild ?? el);
    emit();
  };

  const currentLi = (): HTMLElement | null => {
    const node = window.getSelection()?.anchorNode;
    const base = node instanceof HTMLElement ? node : node?.parentElement;
    const li = base?.closest('li') ?? null;
    return li && ref.current?.contains(li) ? li : null;
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const { lines } = parsePastedLines(e.clipboardData.getData('text/plain'));
    if (lines.length === 0) return;
    lines.forEach((line, i) => {
      if (i > 0) document.execCommand('insertParagraph');
      document.execCommand('insertText', false, line);
    });
    emit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const li = currentLi();
    if (e.key === 'Enter') {
      // Enter en un ítem vacío sacaría el cursor fuera del <ul> (y dejaría un <div>
      // suelto); Shift+Enter metería un <br> dentro del ítem. Ninguno de los dos
      // sirve acá: Enter siempre es "ítem nuevo", y solo si el actual tiene texto.
      e.preventDefault();
      if (li && (li.textContent ?? '').trim()) {
        document.execCommand('insertParagraph');
        emit();
      }
      return;
    }
    if (e.key === 'Backspace' && li && !li.previousElementSibling) {
      // Backspace al inicio del primer ítem lo "desliza" fuera de la lista.
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0) {
        const probe = document.createRange();
        probe.selectNodeContents(li);
        probe.setEnd(sel.anchorNode as Node, sel.anchorOffset);
        if (probe.toString() === '') e.preventDefault();
      }
    }
  };

  const handleInput = () => {
    ensureList();
    emit();
  };

  const tooMany = current.length > LIMITS.includesItems;
  // Solo se muestran contadores de los ítems que ya se acercan al límite (75%);
  // si no, con 30 ítems sería ruido.
  const nearLimit = current
    .map((html, i) => ({ i, len: html.length }))
    .filter((it) => it.len >= LIMITS.includesItemChars * 0.75);

  return (
    <div>
      <div className={`rounded-md border bg-ink overflow-hidden focus-within:border-gold/60 transition ${
        tooMany || nearLimit.some((n) => n.len > LIMITS.includesItemChars) ? 'border-bordeaux-light/60' : 'border-gold/30'
      }`}>
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
          <ToolbarButton label="Ordenar como lista (un ítem por línea)" onMouseDown={restructure}>
            <span aria-hidden>≡</span>
          </ToolbarButton>
        </div>
        <ul
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={emit}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className="min-h-[110px] max-h-[320px] overflow-y-auto list-disc pl-8 pr-3 py-2.5 text-sm leading-relaxed text-cream/90 focus:outline-none"
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
        <span className="flex flex-wrap gap-x-3">
          {nearLimit.map((n) => (
            <CharCounter key={n.i} label={`Ítem ${n.i + 1}`} count={n.len} max={LIMITS.includesItemChars} />
          ))}
        </span>
        <span><CharCounter label="Ítems" count={current.length} max={LIMITS.includesItems} /></span>
      </div>
    </div>
  );
}
