// Convierte la estructura "curso + platos" (usada para transcribir el
// contenido real de los micrositios de forma legible) al formato simple que
// terminó usando el admin: título + HTML con negrita/lista, sin traducción.
// Existe para poder reusar el contenido ya transcripto (en español) sin
// tener que reescribirlo a mano en el formato final.
import type { AdminMenuInput } from '../repos/admin-menus.js';

export interface RawMenuItem {
  name_es: string;
  name_en: string;
}

export interface RawMenuCourse {
  name_es: string;
  name_en: string;
  items: RawMenuItem[];
}

export interface RawMenuInput {
  title_es?: string | null;
  title_en?: string | null;
  note_es?: string | null;
  note_en?: string | null;
  is_visible?: boolean;
  courses: RawMenuCourse[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toAdminMenuInput(raw: RawMenuInput): AdminMenuInput {
  const parts = raw.courses.map((course) => {
    const items = course.items.map((it) => `<li>${escapeHtml(it.name_es)}</li>`).join('');
    return `<p><strong>${escapeHtml(course.name_es)}</strong></p><ul>${items}</ul>`;
  });
  if (raw.note_es) parts.push(`<p><em>${escapeHtml(raw.note_es)}</em></p>`);
  return {
    title: raw.title_es ?? null,
    content_html: parts.join(''),
    is_visible: raw.is_visible ?? true,
  };
}
