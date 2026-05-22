import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { supabaseAdmin } from '../../services/supabase.js';
import { pool } from '../../db.js';
import { adminProductsRouter } from './products.js';
import { adminSellersRouter } from './sellers.js';
import { adminOrdersRouter } from './orders.js';
import { adminSettingsRouter } from './settings.js';

export const adminRouter = Router();

const STORAGE_BUCKET = 'product-images';

// Todas las rutas /api/admin/* exigen JWT válido + admin_user activo.
adminRouter.use(requireAdmin);

// GET /api/admin/me — datos del admin logueado + counters básicos
adminRouter.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query<{
      products: number; orders_paid: number; orders_pending: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE is_active = TRUE) AS products,
         (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS orders_paid,
         (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS orders_pending`,
    );
    res.json({
      data: {
        admin: req.admin,
        stats: rows[0],
      },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/categories — para el dropdown del form de productos
adminRouter.get('/categories', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name_es, name_en, display_order, is_active
         FROM categories ORDER BY display_order, name_es`,
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ─── Storage ─────────────────────────────────────────────
const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  content_type: z.string().regex(/^image\/(jpeg|png|webp|avif)$/i),
});

// POST /api/admin/uploads/sign — genera path único y signed URL para subir
adminRouter.post('/uploads/sign', async (req, res, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const ext = parsed.data.filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `products/${new Date().getFullYear()}/${randomUUID()}.${ext}`;

    // Garantizamos que el bucket exista (idempotente)
    await ensureStorageBucket();

    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw error;

    const publicUrl = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;

    res.json({
      data: {
        upload_url: data.signedUrl,
        token: data.token,
        path,
        public_url: publicUrl,
      },
    });
  } catch (err) { next(err); }
});

// Crea el bucket si no existe (público, solo lectura)
let bucketEnsured = false;
async function ensureStorageBucket() {
  if (bucketEnsured) return;
  const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets();
  if (listErr) throw listErr;
  if (!buckets.some((b) => b.name === STORAGE_BUCKET)) {
    const { error: createErr } = await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: '8MB',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    });
    if (createErr && !createErr.message.includes('already exists')) throw createErr;
  }
  bucketEnsured = true;
}

// ─── Sub-routers ─────────────────────────────────────────
adminRouter.use('/products', adminProductsRouter);
adminRouter.use('/sellers', adminSellersRouter);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use('/settings', adminSettingsRouter);
