import type { ProductMenu } from '../types/api';

export default function MenuBlock({ menu }: { menu: ProductMenu }) {
  return (
    <div className="rounded-lg border border-gold/10 bg-ink/30 p-3">
      {menu.title && <p className="font-display text-base text-cream mb-2">{menu.title}</p>}
      <div
        className="text-sm text-cream/75 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 last:[&_p]:mb-0 [&_strong]:text-cream [&_b]:text-cream"
        // El HTML viene sanitizado del backend (solo negrita/subrayado/listas/párrafos,
        // sin atributos) — ver api/src/lib/sanitizeHtml.ts.
        dangerouslySetInnerHTML={{ __html: menu.content_html }}
      />
    </div>
  );
}
