import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db.js';
import { supabaseAdmin } from '../../services/supabase.js';

// Montado bajo /api/seller/me/branding, ya protegido por requireSeller (ver index.ts).
// Personalización de la landing pública (logo/lema/teléfono) — exclusivo de vendedores
// que el admin marcó con landing_customization_enabled (ver routes/admin/sellers.ts).
export const sellerBrandingRouter = Router();

const LOGO_BUCKET = 'seller-logos';

async function requireCustomizationEnabled(sellerId: number, res: import('express').Response): Promise<boolean> {
  const { rows } = await pool.query<{ landing_customization_enabled: boolean }>(
    `SELECT landing_customization_enabled FROM sellers WHERE id = $1 LIMIT 1`,
    [sellerId],
  );
  if (!rows[0]?.landing_customization_enabled) {
    res.status(403).json({ error: 'No tenés habilitada la personalización de tu página. Pedísela a nuestro equipo.' });
    return false;
  }
  return true;
}

let bucketEnsured = false;
async function ensureLogoBucket() {
  if (bucketEnsured) return;
  const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets();
  if (listErr) throw listErr;
  if (!buckets.some((b) => b.name === LOGO_BUCKET)) {
    const { error: createErr } = await supabaseAdmin.storage.createBucket(LOGO_BUCKET, {
      public: true,
      fileSizeLimit: '4MB',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'],
    });
    if (createErr && !createErr.message.includes('already exists')) throw createErr;
  }
  bucketEnsured = true;
}

const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  content_type: z.string().regex(/^image\/(jpeg|png|webp|avif|svg\+xml)$/i),
});

// POST /api/seller/me/branding/upload-sign — signed URL para subir el logo
sellerBrandingRouter.post('/upload-sign', async (req, res, next) => {
  try {
    if (!(await requireCustomizationEnabled(req.seller!.sellerId, res))) return;
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });

    const ext = parsed.data.filename.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `sellers/${req.seller!.sellerId}/${randomUUID()}.${ext}`;

    await ensureLogoBucket();

    const { data, error } = await supabaseAdmin.storage.from(LOGO_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    const publicUrl = supabaseAdmin.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;

    res.json({ data: { upload_url: data.signedUrl, token: data.token, path, public_url: publicUrl } });
  } catch (err) { next(err); }
});

// Guarda siempre el estado completo (el vendedor edita las tres cosas juntas desde su
// portal, no hace falta soportar updates parciales) — string vacío limpia el campo.
const brandingSchema = z.object({
  logo_url: z.string().url().max(500).nullable(),
  tagline: z.string().max(160),
  public_phone: z.string().max(40),
});

// PATCH /api/seller/me/branding — guarda logo/lema/teléfono público
sellerBrandingRouter.patch('/', async (req, res, next) => {
  try {
    if (!(await requireCustomizationEnabled(req.seller!.sellerId, res))) return;
    const parsed = brandingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    const { logo_url, tagline, public_phone } = parsed.data;

    await pool.query(
      `UPDATE sellers
          SET logo_url = $2,
              tagline = NULLIF($3, ''),
              public_phone = NULLIF($4, ''),
              updated_at = NOW()
        WHERE id = $1`,
      [req.seller!.sellerId, logo_url, tagline, public_phone],
    );
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
