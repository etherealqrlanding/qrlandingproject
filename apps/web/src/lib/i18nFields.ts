// Helper para elegir el campo localizado correcto según el idioma actual.
// Soporta el patrón name_es / name_en de la API.

type Lang = 'es' | 'en';

export function localized<T extends Record<string, unknown>>(
  obj: T,
  field: string,
  lang: Lang | string | undefined,
): string | null {
  const key = `${field}_${lang === 'en' ? 'en' : 'es'}` as keyof T;
  const value = obj[key];
  if (typeof value === 'string') return value;
  // Fallback: si no hay versión del idioma pedido, usar español
  const fallback = obj[`${field}_es` as keyof T];
  return typeof fallback === 'string' ? fallback : null;
}

export function localizedArray<T extends Record<string, unknown>>(
  obj: T,
  field: string,
  lang: Lang | string | undefined,
): string[] {
  const key = `${field}_${lang === 'en' ? 'en' : 'es'}` as keyof T;
  const value = obj[key];
  if (Array.isArray(value)) return value as string[];
  const fallback = obj[`${field}_es` as keyof T];
  return Array.isArray(fallback) ? (fallback as string[]) : [];
}
