// Sube imágenes de una casa a Supabase Storage (bucket product-images) y crea
// las filas en product_images. Idempotente: borra las imágenes previas del producto
// antes de insertar, así re-ejecutar deja el set limpio.
//
// Uso:
//   npm run import:images -- --slug senor-tango --dir "/c/Users/Darwoft/Downloads/Señor Tango"
//   (opcional) --limit 6            cantidad máxima de fotos (default 6)
//   (opcional) --hero "archivo.jpg" nombre de archivo que va como hero (default: la primera)
//
// Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env (ya usados por el backend).
import { parseArgs } from 'node:util';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { supabaseAdmin } from '../services/supabase.js';

const STORAGE_BUCKET = 'product-images';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function collectImages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectImages(full));
    } else if (IMAGE_EXTS.has(extname(entry).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

// Orden natural (foto2 antes que foto10) para que el set quede prolijo.
function naturalSort(a: string, b: string): number {
  return basename(a).localeCompare(basename(b), 'es', { numeric: true, sensitivity: 'base' });
}

// Crea el bucket público si no existe (mismo criterio que el backend admin).
async function ensureStorageBucket() {
  const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets();
  if (listErr) throw listErr;
  if (!buckets.some((b) => b.name === STORAGE_BUCKET)) {
    const { error: createErr } = await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: '8MB',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    });
    if (createErr && !createErr.message.includes('already exists')) throw createErr;
    console.log(`  · bucket "${STORAGE_BUCKET}" creado.`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      dir: { type: 'string' },
      limit: { type: 'string', default: '6' },
      hero: { type: 'string' },
    },
  });

  const slug = values.slug;
  const dir = values.dir;
  const limit = Number.parseInt(values.limit ?? '6', 10);
  if (!slug || !dir) {
    console.error('Faltan argumentos. Uso: --slug <product-slug> --dir <carpeta> [--limit 6] [--hero archivo]');
    process.exit(1);
  }

  const { rows: prodRows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM products WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  const product = prodRows[0];
  if (!product) {
    console.error(`No existe ningún producto con slug "${slug}".`);
    process.exit(1);
  }

  let files = collectImages(dir).sort(naturalSort);
  if (files.length === 0) {
    console.error(`No se encontraron imágenes en "${dir}".`);
    process.exit(1);
  }

  // Si se indicó un hero por nombre, lo movemos al frente.
  if (values.hero) {
    const idx = files.findIndex((f) => basename(f).toLowerCase() === values.hero!.toLowerCase());
    if (idx > 0) files.unshift(files.splice(idx, 1)[0]);
  }
  files = files.slice(0, limit);

  await ensureStorageBucket();

  console.log(`▶ ${product.name} (id ${product.id}) — subiendo ${files.length} imágenes...`);

  const uploaded: { url: string; alt: string; hero: boolean; order: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = extname(file).toLowerCase();
    const buffer = readFileSync(file);
    const path = `products/${new Date().getFullYear()}/${randomUUID()}${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType: CONTENT_TYPE[ext] ?? 'image/jpeg', upsert: false });
    if (upErr) throw upErr;

    const publicUrl = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    uploaded.push({ url: publicUrl, alt: `${product.name} ${i + 1}`, hero: i === 0, order: i + 1 });
    console.log(`  ✓ ${basename(file)}${i === 0 ? '  (hero)' : ''}`);
  }

  // Reemplazamos el set de imágenes del producto de forma atómica.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM product_images WHERE product_id = $1', [product.id]);
    for (const img of uploaded) {
      await client.query(
        `INSERT INTO product_images (product_id, url, alt_text, is_hero, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [product.id, img.url, img.alt, img.hero, img.order],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`✅ ${product.name}: ${uploaded.length} imágenes cargadas (hero: la primera).`);
}

main()
  .catch((err) => { console.error('Falló la subida:', err); process.exit(1); })
  .finally(() => pool.end());
