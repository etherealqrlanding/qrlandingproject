// Mensajes de error claros para los formularios de producto. Puras (sin DOM ni
// imports de la app) para poder testearlas con `npm --workspace apps/web test`.

/** Límites del servidor (api/src/routes/admin/products.ts). No cambiarlos solo acá. */
export const LIMITS = {
  includesItems: 30,
  includesItemChars: 300,
  shortDescription: 500,
  longDescription: 4000,
  optionDescription: 500,
  menuHtml: 20000,
} as const;

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  venue_name: 'Venue / casa',
  slug: 'Slug (URL)',
  category_id: 'Categoría',
  tagline_es: 'Frase destacada',
  badge_es: 'Etiqueta destacada',
  short_description_es: 'Descripción corta',
  long_description_es: 'Descripción larga',
  address_es: 'Dirección',
  neighborhood_es: 'Barrio',
  dinner_show_time_es: 'Horario show con cena',
  dinner_transfer_window_es: 'Horario traslado a la cena',
  show_only_time_es: 'Horario solo show',
  show_only_transfer_window_es: 'Horario traslado al solo show',
  video_url: 'Video (YouTube)',
  children_age_label: 'Rango de edad de menores',
  infant_age_label: 'Rango de edad de infantes',
  display_order: 'Orden de display',
  available_days: 'Días de operación',
  code: 'Código interno',
  name_es: 'Nombre',
  description_es: 'Descripción',
  includes_es: 'Incluye',
  price_adult_usd: 'Precio adulto (USD)',
  price_child_usd: 'Precio menor (USD)',
  default_capacity_per_day: 'Cupo por defecto',
  transfer_price_usd: 'Precio traslado',
  transfer_price_usd_palermo: 'Precio traslado Palermo',
  net_price_adult_usd: 'Neto adulto (USD)',
  net_price_child_usd: 'Neto menor (USD)',
  net_price_adult_ars: 'Neto adulto (ARS)',
  net_price_child_ars: 'Neto menor (ARS)',
  net_transfer_price_usd: 'Neto traslado (USD)',
  net_transfer_price_usd_palermo: 'Neto traslado Palermo (USD)',
  net_transfer_price_ars: 'Neto traslado (ARS)',
  net_transfer_price_ars_palermo: 'Neto traslado Palermo (ARS)',
  title: 'Título',
  content_html: 'Menú',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** Traduce el mensaje en inglés que genera zod a una frase corta en español. */
export function translateZodMessage(msg: string): string {
  let m: RegExpMatchArray | null;
  if ((m = msg.match(/at most (\d+) character/))) return `máximo ${m[1]} caracteres`;
  if ((m = msg.match(/at least (\d+) character/))) return m[1] === '1' ? 'es obligatorio' : `mínimo ${m[1]} caracteres`;
  if ((m = msg.match(/at most (\d+) element/))) return `máximo ${m[1]} ítems`;
  if ((m = msg.match(/less than or equal to (-?[\d.]+)/))) return `no puede ser mayor a ${m[1]}`;
  if ((m = msg.match(/greater than or equal to (-?[\d.]+)/))) return m[1] === '0' ? 'no puede ser negativo' : `no puede ser menor a ${m[1]}`;
  if (/^Required$/i.test(msg)) return 'es obligatorio';
  if (/Invalid url/i.test(msg)) return 'no es una URL válida';
  if (/Invalid email/i.test(msg)) return 'no es un email válido';
  if (/Expected number/i.test(msg)) return 'tiene que ser un número';
  if (/Expected string/i.test(msg)) return 'tiene que ser texto';
  if (/Invalid enum value/i.test(msg)) return 'tiene un valor no permitido';
  if (/^Invalid$/i.test(msg)) return 'tiene un formato no válido';
  return msg;
}

interface ZodIssueLike { path?: (string | number)[]; message?: string }
interface FlattenedLike { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> }

/**
 * Convierte la respuesta de error de la API en una lista de frases para mostrar.
 * Soporta `details` de zod en forma `flatten()` (la que manda el server hoy:
 * campo → mensajes, sin índice de ítem) y en forma `issues` (con path, de donde
 * se saca "ítem N" para las listas).
 */
export function describeApiError(err: { message: string; details?: unknown }): string[] {
  const d = err.details as (FlattenedLike & { issues?: ZodIssueLike[] }) | undefined;
  const out: string[] = [];

  if (d && Array.isArray(d.issues)) {
    for (const issue of d.issues) {
      const [key, idx] = issue.path ?? [];
      const msg = translateZodMessage(issue.message ?? '');
      if (key == null) out.push(msg);
      else if (typeof idx === 'number') out.push(`${fieldLabel(String(key))}, ítem ${idx + 1}: ${msg}`);
      else out.push(`${fieldLabel(String(key))}: ${msg}`);
    }
  } else if (d && typeof d === 'object') {
    for (const [key, msgs] of Object.entries(d.fieldErrors ?? {})) {
      for (const msg of msgs ?? []) out.push(`${fieldLabel(key)}: ${translateZodMessage(msg)}`);
    }
    for (const msg of d.formErrors ?? []) out.push(translateZodMessage(msg));
  }

  if (out.length > 0) return [...new Set(out)];
  return [err.message === 'Invalid input' ? 'Hay datos que el servidor no aceptó. Revisá los campos del formulario.' : err.message];
}

/** Valida la lista "Incluye" con los mismos límites del servidor (se cuenta el HTML, como allá). */
export function validateIncludes(items: string[]): string[] {
  const out: string[] = [];
  if (items.length > LIMITS.includesItems) {
    out.push(`Incluye: máximo ${LIMITS.includesItems} ítems (tiene ${items.length})`);
  }
  items.forEach((html, i) => {
    if (html.length > LIMITS.includesItemChars) {
      out.push(`Incluye, ítem ${i + 1}: máximo ${LIMITS.includesItemChars} caracteres (tiene ${html.length})`);
    }
  });
  return out;
}

/** Valida el largo de un campo de texto. Devuelve [] si está bien. */
export function validateMaxLength(label: string, value: string | null | undefined, max: number): string[] {
  const len = (value ?? '').length;
  return len > max ? [`${label}: máximo ${max} caracteres (tiene ${len})`] : [];
}

export interface OptionDraftLike {
  code?: string | null;
  name_es?: string | null;
  description_es?: string | null;
  includes_es?: string[] | null;
}

/** Validación previa al guardado de un tier: los mismos límites del servidor, con el nombre del campo. */
export function validateOptionDraft(o: OptionDraftLike): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9-]{2,50}$/.test(o.code ?? '')) {
    out.push('Código interno: usá solo minúsculas, números y guiones (2 a 50 caracteres), sin espacios ni acentos');
  }
  const name = (o.name_es ?? '').trim();
  if (!name) out.push('Nombre: es obligatorio');
  else out.push(...validateMaxLength('Nombre', name, 160));
  out.push(...validateMaxLength('Descripción', o.description_es, LIMITS.optionDescription));
  out.push(...validateIncludes(o.includes_es ?? []));
  return out;
}

/** Validación previa al guardado de un menú. */
export function validateMenuDraft(m: { title: string; content_html: string }): string[] {
  return [
    ...validateMaxLength('Título', m.title, 160),
    ...validateMaxLength('Menú', m.content_html, LIMITS.menuHtml),
  ];
}
