// Helper para elegir el campo localizado correcto según el idioma actual.
// Soporta el patrón name_es / name_en de la API.

type Lang = 'es' | 'en';

export function localized(
  obj: unknown,
  field: string,
  lang: Lang | string | undefined,
): string | null {
  const rec = obj as Record<string, unknown>;
  const key = `${field}_${lang === 'en' ? 'en' : 'es'}`;
  const value = rec[key];
  if (typeof value === 'string') return value;
  const fallback = rec[`${field}_es`];
  return typeof fallback === 'string' ? fallback : null;
}

export function localizedArray(
  obj: unknown,
  field: string,
  lang: Lang | string | undefined,
): string[] {
  const rec = obj as Record<string, unknown>;
  const key = `${field}_${lang === 'en' ? 'en' : 'es'}`;
  const value = rec[key];
  if (Array.isArray(value)) return value as string[];
  const fallback = rec[`${field}_es`];
  return Array.isArray(fallback) ? (fallback as string[]) : [];
}
