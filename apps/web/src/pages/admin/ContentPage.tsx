import { useEffect, useState } from 'react';
import { adminApi, AdminApiError, type AboutContent, type FaqItem, type SellerFaqItem } from '../../lib/adminApi';
import Spinner from '../../components/Spinner';

type Tab = 'about' | 'faq' | 'seller-faq';

export default function ContentPage() {
  const [tab, setTab] = useState<Tab>('about');

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-cream">Contenido</h1>
      <p className="mt-1 text-sm text-cream/50">Editá las secciones del sitio y del portal de vendedores.</p>

      <div className="mt-6 flex gap-2 flex-wrap">
        <TabButton active={tab === 'about'} onClick={() => setTab('about')}>Nosotros</TabButton>
        <TabButton active={tab === 'faq'} onClick={() => setTab('faq')}>FAQ Clientes</TabButton>
        <TabButton active={tab === 'seller-faq'} onClick={() => setTab('seller-faq')}>FAQ Vendedores</TabButton>
      </div>

      <div className="mt-6">
        {tab === 'about' && <AboutEditor />}
        {tab === 'faq' && <FaqEditor />}
        {tab === 'seller-faq' && <SellerFaqEditor />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm transition ${
        active ? 'bg-gold text-ink font-medium' : 'border border-gold/30 text-cream/70 hover:bg-gold/10'
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-cream/50">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-cream/40">{hint}</p>}
    </label>
  );
}

function Saved({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-sm text-gold-soft">{msg}</p>;
}

function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border border-bordeaux-light/40 bg-bordeaux-deep/20 p-3 text-sm text-cream/80">{msg}</div>
  );
}

// ─── Nosotros ────────────────────────────────────────────
function AboutEditor() {
  const [form, setForm] = useState<Omit<AboutContent, 'updated_at'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings.getAbout()
      .then((d) => setForm({ title_es: d.title_es, title_en: d.title_en, body_es: d.body_es, body_en: d.body_en }))
      .catch((err) => setError((err as AdminApiError).message));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true); setError(null); setSaved(null);
    try {
      await adminApi.settings.updateAbout(form);
      setSaved('✓ Guardado.');
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  if (!form) return error ? <ErrorMsg msg={error} /> : <Spinner />;

  return (
    <form onSubmit={save} className="space-y-5">
      <Field label="Título" hint="El sitio traduce automáticamente al resto de los idiomas">
        <input className="input" value={form.title_es} onChange={(e) => setForm({ ...form, title_es: e.target.value })} />
      </Field>
      <Field label="Texto — separá párrafos con una línea en blanco">
        <textarea className="input min-h-[200px]" value={form.body_es} onChange={(e) => setForm({ ...form, body_es: e.target.value })} />
      </Field>

      <ErrorMsg msg={error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? <Spinner size="sm" /> : 'Guardar'}
        </button>
        <Saved msg={saved} />
      </div>
    </form>
  );
}

// ─── Preguntas Frecuentes ────────────────────────────────
const EMPTY_ITEM: FaqItem = { q_es: '', q_en: '', a_es: '', a_en: '' };

function FaqEditor() {
  const [items, setItems] = useState<FaqItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings.getFaq()
      .then((d) => setItems(d.items))
      .catch((err) => setError((err as AdminApiError).message));
  }, []);

  const update = (i: number, patch: Partial<FaqItem>) => {
    setItems((prev) => prev!.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const add = () => setItems((prev) => [...(prev ?? []), { ...EMPTY_ITEM }]);
  const remove = (i: number) => setItems((prev) => prev!.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    setItems((prev) => {
      const arr = [...prev!];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const save = async () => {
    if (!items) return;
    setSaving(true); setError(null); setSaved(null);
    try {
      // Descartamos preguntas totalmente vacías.
      const clean = items.filter((it) => it.q_es.trim() || it.q_en.trim() || it.a_es.trim() || it.a_en.trim());
      const result = await adminApi.settings.updateFaq(clean);
      setItems(result.items);
      setSaved('✓ Guardado.');
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  if (!items) return error ? <ErrorMsg msg={error} /> : <Spinner />;

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="text-sm text-cream/50">Todavía no hay preguntas. Agregá la primera.</p>
      )}

      {items.map((it, i) => (
        <div key={i} className="rounded-xl border border-gold/15 bg-ink-soft/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-cream/40">Pregunta {i + 1}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 text-cream/60 hover:text-gold disabled:opacity-30" aria-label="Subir">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="px-2 py-1 text-cream/60 hover:text-gold disabled:opacity-30" aria-label="Bajar">↓</button>
              <button type="button" onClick={() => remove(i)} className="px-2 py-1 text-bordeaux-light hover:text-bordeaux" aria-label="Eliminar">✕</button>
            </div>
          </div>
          <div className="space-y-3">
            <Field label="Pregunta">
              <input className="input" value={it.q_es} onChange={(e) => update(i, { q_es: e.target.value })} />
            </Field>
            <Field label="Respuesta">
              <textarea className="input min-h-[90px]" value={it.a_es} onChange={(e) => update(i, { a_es: e.target.value })} />
            </Field>
          </div>
        </div>
      ))}

      <button type="button" onClick={add} className="btn-ghost text-sm">+ Agregar pregunta</button>

      <ErrorMsg msg={error} />
      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? <Spinner size="sm" /> : 'Guardar'}
        </button>
        <Saved msg={saved} />
      </div>
    </div>
  );
}

// ─── FAQ Vendedores ──────────────────────────────────────────
// Solo español. Se muestran en /seller/ayuda del portal del vendedor.
const EMPTY_SELLER_ITEM: SellerFaqItem = { q_es: '', a_es: '' };

function SellerFaqEditor() {
  const [items, setItems] = useState<SellerFaqItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.settings.getSellerFaq()
      .then((d) => setItems(d.items))
      .catch((err) => setError((err as AdminApiError).message));
  }, []);

  const update = (i: number, patch: Partial<SellerFaqItem>) =>
    setItems((prev) => prev!.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const add = () => setItems((prev) => [...(prev ?? []), { ...EMPTY_SELLER_ITEM }]);
  const remove = (i: number) => setItems((prev) => prev!.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    setItems((prev) => {
      const arr = [...prev!];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const save = async () => {
    if (!items) return;
    setSaving(true); setError(null); setSaved(null);
    try {
      const clean = items.filter((it) => it.q_es.trim() || it.a_es.trim());
      const result = await adminApi.settings.updateSellerFaq(clean);
      setItems(result.items);
      setSaved('✓ Guardado.');
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError((err as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  if (!items) return error ? <ErrorMsg msg={error} /> : <Spinner />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-cream/50">
        Estas preguntas aparecen en <strong className="text-cream/70">/seller/ayuda</strong> del portal de vendedores. Solo español.
      </p>

      {items.length === 0 && (
        <p className="text-sm text-cream/50">Todavía no hay preguntas. Agregá la primera.</p>
      )}

      {items.map((it, i) => (
        <div key={i} className="rounded-xl border border-gold/15 bg-ink-soft/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-cream/40">Pregunta {i + 1}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 text-cream/60 hover:text-gold disabled:opacity-30" aria-label="Subir">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="px-2 py-1 text-cream/60 hover:text-gold disabled:opacity-30" aria-label="Bajar">↓</button>
              <button type="button" onClick={() => remove(i)} className="px-2 py-1 text-bordeaux-light hover:text-bordeaux" aria-label="Eliminar">✕</button>
            </div>
          </div>
          <Field label="Pregunta">
            <input className="input" value={it.q_es} onChange={(e) => update(i, { q_es: e.target.value })} />
          </Field>
          <Field label="Respuesta">
            <textarea className="input min-h-[90px]" value={it.a_es} onChange={(e) => update(i, { a_es: e.target.value })} />
          </Field>
        </div>
      ))}

      <button type="button" onClick={add} className="btn-ghost text-sm">+ Agregar pregunta</button>

      <ErrorMsg msg={error} />
      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? <Spinner size="sm" /> : 'Guardar'}
        </button>
        <Saved msg={saved} />
      </div>
    </div>
  );
}
