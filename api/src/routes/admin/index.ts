import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { supabaseAdmin } from '../../services/supabase.js';
import { pool } from '../../db.js';
import { addAdminConnection, removeAdminConnection } from '../../services/sseNotifier.js';
import { adminProductsRouter } from './products.js';
import { adminSellersRouter } from './sellers.js';
import { adminOrdersRouter } from './orders.js';
import { adminSettingsRouter } from './settings.js';

export const adminRouter = Router();

const STORAGE_BUCKET = 'product-images';

// GET /api/admin/notifications/stream — push en vivo (SSE) para el panel de órdenes.
// Va ANTES de requireAdmin porque EventSource no puede mandar headers custom: el
// token viaja por query param y se valida acá mismo (mismo patrón que el vendedor).
adminRouter.get('/notifications/stream', async (req, res, next) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !userData?.user) return res.status(401).end();

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM admin_users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [userData.user.id],
    );
    if (!rows[0]) return res.status(403).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch { /* cliente desconectado */ }
    }, 25_000);

    addAdminConnection(res);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeAdminConnection(res);
    });
  } catch (err) { next(err); }
});

// Todas las demás rutas /api/admin/* exigen JWT válido + admin_user activo.
adminRouter.use(requireAdmin);

// GET /api/admin/me — datos del admin logueado + counters básicos
adminRouter.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query<{
      products: number; orders_paid: number; orders_pending: number;
      mp_revenue_ars: number; net_pending_ars: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE is_active = TRUE) AS products,
         (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS orders_paid,
         (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS orders_pending,
         (SELECT COALESCE(SUM(total_ars), 0)::float FROM orders
           WHERE status = 'paid' AND payment_method = 'mercadopago') AS mp_revenue_ars,
         (SELECT COALESCE(SUM(
            CASE WHEN a.net_total_usd_snapshot IS NOT NULL
                 THEN a.net_total_usd_snapshot * o.exchange_rate_used
                 ELSE o.total_ars END
          ), 0)::float
          FROM orders o
          JOIN order_attributions a ON a.order_id = o.id
          WHERE o.status = 'paid' AND o.payment_method = 'cash' AND a.net_settled_at IS NULL) AS net_pending_ars`,
    );
    res.json({
      data: {
        admin: req.admin,
        stats: rows[0],
      },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/preview-link — código interno para que el equipo vea el sitio público
// ya "adentro" del muro de exclusividad, sin tener que pedirle el código a un vendedor
// real. Reutiliza el mismo mecanismo que ya usan los clientes referidos (?ref=CODE +
// cookie), pero contra un vendedor "casa" dedicado (is_house = TRUE, comisión 0) que no
// se usa para ventas — se crea solo la primera vez que se pide este link.
const PREVIEW_SELLER_CODE = 'ADMINPREVIEW';

adminRouter.get('/preview-link', async (_req, res, next) => {
  try {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM sellers WHERE code = $1 LIMIT 1`,
      [PREVIEW_SELLER_CODE],
    );
    if (rows[0]) {
      // Por si alguna vez quedó desactivado a mano, nos aseguramos de que siga sirviendo.
      await pool.query(`UPDATE sellers SET is_active = TRUE WHERE id = $1`, [rows[0].id]);
    } else {
      await pool.query(
        `INSERT INTO sellers (code, name, commission_percent, is_active, is_house, notes)
         VALUES ($1, $2, 0, TRUE, TRUE, $3)
         ON CONFLICT (code) DO NOTHING`,
        [
          PREVIEW_SELLER_CODE,
          'Vista previa (equipo)',
          'Código interno para que el equipo revise el sitio público como si fuera un cliente. No se usa para ventas reales — excluido de estadísticas de vendedores.',
        ],
      );
    }
    res.json({ data: { ref_code: PREVIEW_SELLER_CODE } });
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
