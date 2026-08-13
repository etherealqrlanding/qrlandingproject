import { useState } from 'react';
import { adminApi, AdminApiError, type AdminMenu, type AdminMenuInput, type AdminProductDetail } from '../../../lib/adminApi';
import Checkbox from '../../../components/Checkbox';
import RichTextEditor from '../../../components/admin/RichTextEditor';
import Collapse from '../../../components/Collapse';

interface Props {
  product: AdminProductDetail;
  onChange: (p: AdminProductDetail) => void;
}

export default function MenuEditor({ product, onChange }: Props) {
  const dinnerOptions = product.options.filter((o) => o.has_dinner);
  const [expandedOptionId, setExpandedOptionId] = useState<number | null>(null);

  const refresh = async () => {
    const updated = await adminApi.products.get(product.id);
    onChange(updated);
  };

  if (dinnerOptions.length === 0) {
    return (
      <p className="text-sm text-cream/40">
        Ningún tier tiene "Incluye cena" activado — activalo en la pestaña Tiers/Opciones para poder cargarle un menú.
      </p>
    );
  }

  return (
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
                {own ? 'Menú cargado' : 'Sin menú'} {expanded ? '▲' : '▼'}
              </span>
            </button>
            {expanded && (
              <Collapse className="border-t border-gold/10 p-4">
                <MenuScopeForm
                  key={own?.id ?? `option-${opt.id}-empty`}
                  initial={own}
                  onSave={async (input) => { await adminApi.products.menu.upsertOption(opt.id, input); await refresh(); }}
                  onDelete={own ? async () => { await adminApi.products.menu.deleteOption(opt.id); await refresh(); } : undefined}
                  deleteLabel="Eliminar menú"
                />
              </Collapse>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MenuScopeForm({ initial, onSave, onDelete, deleteLabel }: {
  initial: AdminMenu | undefined;
  onSave: (input: AdminMenuInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  deleteLabel?: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [contentHtml, setContentHtml] = useState(initial?.content_html ?? '');
  const [isVisible, setIsVisible] = useState(initial?.is_visible ?? true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ title: title.trim() || null, content_html: contentHtml, is_visible: isVisible });
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
      <label className="block">
        <span className="block text-sm text-cream/80 mb-1.5">Título (opcional)</span>
        <input
          type="text" maxLength={160} placeholder="Ej: Menú Cena Show VIP"
          value={title} onChange={(e) => setTitle(e.target.value)}
          className="input"
        />
      </label>

      <label className="block">
        <span className="block text-sm text-cream/80 mb-1.5">Menú</span>
        <RichTextEditor
          value={contentHtml}
          onChange={setContentHtml}
          placeholder="Pegá o escribí el menú acá. Seleccioná texto para ponerlo en negrita, subrayarlo o armar una lista."
        />
      </label>

      <label className="flex items-center gap-2">
        <Checkbox checked={isVisible} onChange={setIsVisible} />
        <span className="text-sm text-cream/80">Mostrar en la página pública</span>
      </label>

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
