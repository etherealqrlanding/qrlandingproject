// Sanitizador simple para el HTML del editor de menús (contentEditable con
// negrita/subrayado/listas). No es un parser HTML completo: alcanza porque el
// origen es un editor propio de formato acotado, no HTML arbitrario de
// terceros — es una capa de defensa extra para que un admin comprometido (o
// un paste con basura de un PDF/Word) no pueda inyectar <script>, estilos ni
// atributos con eventos.
const ALLOWED_TAGS = new Set(['p', 'br', 'div', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li']);

export function sanitizeMenuHtml(html: string): string {
  let out = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, tagRaw: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    const isClosing = match.startsWith('</');
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });

  return out.trim();
}
