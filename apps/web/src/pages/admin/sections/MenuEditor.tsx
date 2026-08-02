import { useState } from 'react';
import { adminApi, AdminApiError, type AdminMenu, type AdminMenuInput, type AdminProductDetail } from '../../../lib/adminApi';
import Checkbox from '../../../components/Checkbox';

interface Props {
  product: AdminProductDetail;
  onChange: (p: AdminProductDetail) => void;
}

interface CourseDraft {
  name_es: string;
  name_en: string;
  items_es: string; // textarea: un plato por línea
  items_en: string;
}

interface MenuDraft {
  title_es: string;
  title_en: string;
  note_es: string;
  note_en: string;
  is_visible: boolean;
  courses: CourseDraft[];
}

function menuToDraft(menu: AdminMenu | undefined): MenuDraft {
  if (!menu) return { title_es: '', title_en: '', note_es: '', note_en: '', is_visible: true, courses: [] };
  return {
    title_es: menu.title_es ?? '',
    title_en: menu.title_en ?? '',
    note_es: menu.note_es ?? '',
    note_en: menu.note_en ?? '',
    is_visible: menu.is_visible,
    courses: menu.courses.map((c) => ({
      name_es: c.name_es,
      name_en: c.name_en,
      items_es: c.items.map((i) => i.name_es).join('\n'),
      items_en: c.items.map((i) => i.name_en).join('\n'),
    })),
  };
}

function draftToInput(draft: MenuDraft): AdminMenuInput {
  return {
    title_es: draft.title_es.trim() || null,
    title_en: draft.title_en.trim() || null,
    note_es: draft.note_es.trim() || null,
    note_en: draft.note_en.trim() || null,
    is_visible: draft.is_visible,
    courses: draft.courses
      .filter((c) => c.name_es.trim())
      .map((c) => {
        const es = c.items_es.split('\n').map((l) => l.trim()).filter(Boolean);
        const en = c.items_en.split('\n').map((l) => l.trim()).filter(Boolean);
        const items: { name_es: string; name_en: string }[] = [];
        for (let i = 0; i < Math.max(es.length, en.length); i++) {
          const name_es = es[i] ?? en[i] ?? '';
          const name_en = en[i] ?? es[i] ?? '';
          if (name_es.trim()) items.push({ name_es, name_en });
        }
        return { name_es: c.name_es.trim(), name_en: c.name_en.trim() || c.name_es.trim(), items };
      })
      .filter((c) => c.items.length > 0),
  };
}

export default function MenuEditor({ product, onChange }: Props) {
  const dinnerOptions = product.options.filter((o) => o.has_dinner);
  const generalMenu = product.menus.find((m) => m.option_id === null);
  const [expandedOptionId, setExpandedOptionId] = useState<number | null>(null);

  const refresh = async () => {
    const updated = await adminApi.products.get(product.id);
    onChange(updated);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-xl text-cream mb-1">Menú general de la casa</h3>
        <p className="text-sm text-cream/50 mb-3">
          Se muestra en los servicios con cena que no tengan un menú propio más abajo.
        </p>
        <MenuScopeForm
          key={generalMenu?.id ?? 'general-empty'}
          initial={generalMenu}
          onSave={async (input) => { await adminApi.products.menu.upsertGeneral(product.id, input); await refresh(); }}
          onDelete={generalMenu ? async () => { await adminApi.products.menu.deleteGeneral(product.id); await refresh(); } : undefined}
          deleteLabel="Eliminar menú general"
        />
      </div>

      {dinnerOptions.length === 0 && (
        <p className="text-sm text-cream/40">
          Ningún tier tiene "Incluye cena" activado — activalo en la pestaña Tiers/Opciones para poder cargarle un menú propio.
        </p>
      )}

      {dinnerOptions.length > 0 && (
        <div>
          <h3 className="font-display text-xl text-cream mb-3">Menú por servicio</h3>
          <div className="space-y-2">
            {dinnerOptions.map((opt) => {
              const own = product.menus.find((m) => m.option_id === opt.id);
              const expanded = expandedOptionId === opt.id;
              return (
                <div key={opt.id} className="rounded-lg border border-gold/15 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedOptionId(expanded ? null : opt.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gold/5"
                  >
                    <span className="text-sm font-medium text-cream">{opt.name_es}</span>
                    <span className="text-xs text-cream/40">
                      {own ? 'Menú propio' : 'Usa el menú general'} {expanded ? '▲' : '▼'}
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-gold/10 p-4">
                      <MenuScopeForm
                        key={own?.id ?? `option-${opt.id}-empty`}
                        initial={own}
                        emptyHint='Todavía usa el menú general de la casa. Guardá acá para darle un menú propio a este servicio.'
                        onSave={async (input) => { await adminApi.products.menu.upsertOption(opt.id, input); await refresh(); }}
                        onDelete={own ? async () => { await adminApi.products.menu.deleteOption(opt.id); await refresh(); } : undefined}
                        deleteLabel="Eliminar menú propio (vuelve a usar el general)"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuScopeForm({ initial, onSave, onDelete, deleteLabel, emptyHint }: {
  initial: AdminMenu | undefined;
  onSave: (input: AdminMenuInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
  emptyHint?: string;
}) {
  const [draft, setDraft] = useState<MenuDraft>(() => menuToDraft(initial));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateCourse = (i: number, patch: Partial<CourseDraft>) => {
    setDraft((d) => ({ ...d, courses: d.courses.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  };
  const addCourse = () => setDraft((d) => ({ ...d, courses: [...d.courses, { name_es: '', name_en: '', items_es: '', items_en: '' }] }));
  const removeCourse = (i: number) => setDraft((d) => ({ ...d, courses: d.courses.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draftToInput(draft));
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm('¿Eliminar este menú?')) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      alert((err as AdminApiError).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {emptyHint && !initial && <p className="text-xs text-cream/40">{emptyHint}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Título (ES, opcional)" hint="Ej: Menú Cena Show VIP">
          <input type="text" maxLength={160} value={draft.title_es} onChange={(e) => setDraft((d) => ({ ...d, title_es: e.target.value }))} className="input" />
        </Field>
        <Field label="Título (EN, opcional)">
          <input type="text" maxLength={160} value={draft.title_en} onChange={(e) => setDraft((d) => ({ ...d, title_en: e.target.value }))} className="input" />
        </Field>
        <Field label="Nota (ES, opcional)" hint="Ej: Menú sujeto a sugerencia del chef y estacionalidad">
          <input type="text" maxLength={300} value={draft.note_es} onChange={(e) => setDraft((d) => ({ ...d, note_es: e.target.value }))} className="input" />
        </Field>
        <Field label="Nota (EN, opcional)">
          <input type="text" maxLength={300} value={draft.note_en} onChange={(e) => setDraft((d) => ({ ...d, note_en: e.target.value }))} className="input" />
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <Checkbox checked={draft.is_visible} onChange={(checked) => setDraft((d) => ({ ...d, is_visible: checked }))} />
        <span className="text-sm text-cream/80">Mostrar en la página pública</span>
      </label>

      <div className="space-y-3">
        {draft.courses.map((course, i) => (
          <div key={i} className="rounded-lg border border-gold/10 bg-ink/30 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="grid sm:grid-cols-2 gap-2 flex-1">
                <input
                  type="text" placeholder="Curso, ej: Entrada" maxLength={80}
                  value={course.name_es} onChange={(e) => updateCourse(i, { name_es: e.target.value })}
                  className="input text-sm"
                />
                <input
                  type="text" placeholder="Course, en inglés" maxLength={80}
                  value={course.name_en} onChange={(e) => updateCourse(i, { name_en: e.target.value })}
                  className="input text-sm"
                />
              </div>
              <button type="button" onClick={() => removeCourse(i)} className="text-xs text-bordeaux-light hover:text-bordeaux-light/70 shrink-0 mt-2.5">
                Eliminar
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <textarea
                rows={4} placeholder="Un plato por línea (ES)"
                value={course.items_es} onChange={(e) => updateCourse(i, { items_es: e.target.value })}
                className="input text-sm"
              />
              <textarea
                rows={4} placeholder="Un plato por línea (EN)"
                value={course.items_en} onChange={(e) => updateCourse(i, { items_en: e.target.value })}
                className="input text-sm"
              />
            </div>
          </div>
        ))}
        <button type="button" onClick={addCourse} className="text-sm text-gold-soft hover:text-gold">
          + Agregar curso
        </button>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar menú'}
        </button>
        {onDelete && (
          <button type="button" onClick={handleDelete} disabled={deleting} className="text-sm text-bordeaux-light hover:text-bordeaux-light/70 disabled:opacity-50">
            {deleting ? 'Eliminando...' : deleteLabel ?? 'Eliminar'}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-cream/80 mb-1.5">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-cream/40">{hint}</p>}
    </label>
  );
}
