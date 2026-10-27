// Utilidades de pegado para los editores del admin. Puras (sin DOM) para poder
// testearlas con `npm --workspace apps/web test`.

// Viñetas que dejan Word/PDF/web: símbolos Unicode comunes + los glifos de
// Symbol/Wingdings que Word exporta como caracteres de uso privado.
const BULLET_SYMBOLS = '•·●○▪■◦‣⁃∙▸►➢✓✔\uF0B7\uF0A7\uF0D8\uF0FC';
const BULLET_CHARS = `[${BULLET_SYMBOLS}]`;
// Guiones y asterisco solo cuentan como viñeta si les sigue un espacio ("- x"),
// para no comerse "-5% off" ni "*Sujeto a disponibilidad".
const DASH_CHARS = '[*\\-–—]';

const LIST_PREFIX = new RegExp(
  `^\\s*(?:${BULLET_CHARS}\\s*|${DASH_CHARS}\\s+|\\d{1,3}[.)]\\s+)`,
);
const SYMBOL_BULLET_PREFIX = new RegExp(`^\\s*(?:${BULLET_CHARS}\\s*|${DASH_CHARS}\\s+)`);

function splitLines(text: string): string[] {
  return text.replace(/\r\n?|\u2028|\u2029|\u000b/g, '\n').split('\n');
}

export interface ParsedPaste {
  /** Una entrada por línea no vacía, sin prefijo de viñeta/numeración. */
  lines: string[];
  /** true si al menos una línea traía viñeta o numeración (venía de una lista). */
  hadMarkers: boolean;
}

/** Parte un texto pegado en líneas limpias para armar ítems de lista. */
export function parsePastedLines(text: string): ParsedPaste {
  let hadMarkers = false;
  const lines: string[] = [];
  for (const raw of splitLines(text)) {
    let line = raw.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;
    // Hasta 2 pasadas: cubre "• - texto" o "1. • texto".
    for (let i = 0; i < 2 && LIST_PREFIX.test(line); i++) {
      line = line.replace(LIST_PREFIX, '').trim();
      hadMarkers = true;
    }
    if (line) lines.push(line);
  }
  return { lines, hadMarkers };
}

/**
 * Para campos de texto plano (descripciones): unifica las viñetas a "• " y
 * limpia espacios, conservando los saltos de línea y párrafos. No toca la
 * numeración ("1.") porque ahí el número es parte del contenido.
 */
export function normalizeBullets(text: string): string {
  return splitLines(text)
    .map((raw) => {
      const line = raw.replace(/\u00a0/g, ' ').replace(/[ \t]+$/, '');
      return line.replace(SYMBOL_BULLET_PREFIX, '• ');
    })
    .join('\n');
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * HTML para pegar en el editor del menú: si venía una lista, un <li> por
 * línea; si eran varias líneas sin viñetas, un <p> por línea; si es una sola
 * línea, null (se pega como texto plano y respeta el cursor).
 */
export function pastedTextToHtml(text: string): string | null {
  const { lines, hadMarkers } = parsePastedLines(text);
  if (lines.length === 0) return null;
  if (hadMarkers) return `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
  if (lines.length > 1) return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  return null;
}
