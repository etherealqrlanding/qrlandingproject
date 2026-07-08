import { pool } from '../db.js';

// Contenido editable de las páginas "Nosotros" y "Preguntas Frecuentes".
// Se guarda en la tabla settings (key/value jsonb), bilingüe (es/en).

const ABOUT_KEY = 'about_page';
const FAQ_KEY = 'faq_page';

export interface AboutContent {
  title_es: string;
  title_en: string;
  body_es: string;   // texto libre; párrafos separados por línea en blanco
  body_en: string;
  updated_at: string | null;
}

export interface FaqItem {
  q_es: string;
  q_en: string;
  a_es: string;
  a_en: string;
}

export interface FaqContent {
  items: FaqItem[];
  updated_at: string | null;
}

const EMPTY_ABOUT: AboutContent = {
  title_es: '', title_en: '', body_es: '', body_en: '', updated_at: null,
};

const EMPTY_FAQ: FaqContent = { items: [], updated_at: null };

async function readSetting<T>(key: string): Promise<T | null> {
  const { rows } = await pool.query<{ value: T }>(
    `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

async function writeSetting(key: string, value: unknown, description: string): Promise<void> {
  await pool.query(
    `INSERT INTO settings (key, value, description)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value), description],
  );
}

export async function getAbout(): Promise<AboutContent> {
  const value = await readSetting<AboutContent>(ABOUT_KEY);
  return value ? { ...EMPTY_ABOUT, ...value } : EMPTY_ABOUT;
}

export async function setAbout(input: Omit<AboutContent, 'updated_at'>): Promise<AboutContent> {
  const payload = { ...input, updated_at: new Date().toISOString() };
  await writeSetting(ABOUT_KEY, payload, 'Contenido de la página Nosotros (bilingüe).');
  return payload;
}

export async function getFaq(): Promise<FaqContent> {
  const value = await readSetting<FaqContent>(FAQ_KEY);
  return value ? { items: value.items ?? [], updated_at: value.updated_at ?? null } : EMPTY_FAQ;
}

export async function setFaq(items: FaqItem[]): Promise<FaqContent> {
  const payload = { items, updated_at: new Date().toISOString() };
  await writeSetting(FAQ_KEY, payload, 'Contenido de la página Preguntas Frecuentes (bilingüe).');
  return payload;
}

// ─── FAQs para vendedores ─────────────────────────────────
// Solo en español (los vendedores son locales). Se editan desde el admin
// y se consumen desde el portal del vendedor.

const FAQ_SELLER_KEY = 'faq_seller_page';

export interface SellerFaqItem {
  q_es: string;
  a_es: string;
}

export interface SellerFaqContent {
  items: SellerFaqItem[];
  updated_at: string | null;
}

const EMPTY_SELLER_FAQ: SellerFaqContent = { items: [], updated_at: null };

export async function getSellerFaq(): Promise<SellerFaqContent> {
  const value = await readSetting<SellerFaqContent>(FAQ_SELLER_KEY);
  return value ? { items: value.items ?? [], updated_at: value.updated_at ?? null } : EMPTY_SELLER_FAQ;
}

export async function setSellerFaq(items: SellerFaqItem[]): Promise<SellerFaqContent> {
  const payload = { items, updated_at: new Date().toISOString() };
  await writeSetting(FAQ_SELLER_KEY, payload, 'Preguntas frecuentes para el portal de vendedores.');
  return payload;
}
