import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import {
  createSeller, deactivateSeller, deleteSeller, getSeller, listSellerOrders,
  listSellersWithStats, markCommissionsPaid, updateSeller,
} from '../../repos/sellers.js';
import { config } from '../../config.js';
import { supabaseAdmin } from '../../services/supabase.js';
import { pool } from '../../db.js';
import { sendSellerPortalInvite, sendSellerPasswordReset } from '../../services/email.js';
import { createCommissionPaidNotification } from '../../repos/notifications.js';

export const adminSellersRouter = Router();

const sellerSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Solo letras, números, guion y guion bajo (3-32)'),
  name: z.string().min(2).max(160),
  contact_email: z.string().email().max(160).optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  kind: z.string().max(40).optional().nullable(),
  commission_percent: z.number().min(0).max(100),
  notes: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
  is_permanent: z.boolean().optional(),
});

adminSellersRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await listSellersWithStats();
    res.json({ data: rows });
  } catch (err) { next(err); }
});

adminSellersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const seller = await getSeller(id);
    if (!seller) return res.status(404).json({ error: 'Not found' });
    res.json({ data: seller });
  } catch (err) { next(err); }
});

adminSellersRouter.post('/', async (req, res, next) => {
  try {
    const parsed = sellerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const id = await createSeller(parsed.data);
    const seller = await getSeller(id);
    res.status(201).json({ data: seller });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un vendedor con ese código' });
    }
    next(err);
  }
});

adminSellersRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = sellerSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const ok = await updateSeller(id, parsed.data);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    const seller = await getSeller(id);
    res.json({ data: seller });
  } catch (err) { next(err); }
});

adminSellersRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const ok = await deactivateSeller(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// DELETE /api/admin/sellers/:id/permanent — elimina definitivamente el registro.
// Falla con 409 si el vendedor tiene ventas asociadas (integridad histórica).
adminSellersRouter.delete('/:id/permanent', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const result = await deleteSeller(id);
    if (!result.deleted) return res.status(404).json({ error: 'Not found' });

    // Si tenía cuenta en Supabase Auth, la eliminamos también
    if (result.supabase_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(result.supabase_user_id).catch((err) => {
        console.warn('No se pudo eliminar el usuario de Supabase Auth:', err);
      });
    }

    res.json({ data: { ok: true } });
  } catch (err) {
    if ((err as Error & { code?: string }).code === 'HAS_ORDERS') {
      return res.status(409).json({ error: (err as Error).message });
    }
    next(err);
  }
});

// ─── Órdenes atribuidas ──────────────────────────────────
adminSellersRouter.get('/:id/orders', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await listSellerOrders(id, { status });
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ─── Marcar comisiones como pagadas ──────────────────────
const markPaidSchema = z.object({
  order_ids: z.array(z.number().int().positive()).min(1).max(500),
});

adminSellersRouter.post('/:id/commissions/mark-paid', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = markPaidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const updated = await markCommissionsPaid(id, parsed.data.order_ids);

    if (updated > 0) {
      // Sumar comisiones recién marcadas para la notificación in-app
      const { rows: sumRows } = await pool.query<{ total: string }>(
        `SELECT SUM(a.commission_amount_usd)::text AS total
           FROM order_attributions a
          WHERE a.seller_id = $1
            AND a.order_id = ANY($2::int[])
            AND a.paid_to_seller_at IS NOT NULL`,
        [id, parsed.data.order_ids],
      );
      const totalUsd = parseFloat(sumRows[0]?.total ?? '0');

      // Notificación in-app (fire-and-forget)
      createCommissionPaidNotification(id, parsed.data.order_ids, totalUsd)
        .catch((e) => console.error('[notif] createCommissionPaidNotification failed:', e));
    }

    res.json({ data: { updated } });
  } catch (err) { next(err); }
});

// ─── Invitación al portal self-service ───────────────────
// POST /api/admin/sellers/:id/invite
// Genera el link via Supabase Admin (sin enviar email desde Supabase — evita rate limit)
// y lo envía nosotros mismos via Resend.
adminSellersRouter.post('/:id/invite', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const seller = await getSeller(id);
    if (!seller) return res.status(404).json({ error: 'Not found' });
    if (!seller.contact_email) return res.status(400).json({ error: 'El vendedor no tiene email de contacto registrado' });
    if (!seller.is_active) return res.status(400).json({ error: 'El vendedor está inactivo' });

    const portalUrl = `${config.WEB_ORIGIN.replace(/\/$/, '')}/seller/login`;

    if (seller.supabase_user_id) {
      // Ya tiene cuenta — generar link de reset
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: seller.contact_email,
        options: { redirectTo: portalUrl },
      });
      if (linkError) return res.status(400).json({ error: linkError.message });

      // Intentar enviar por email (fire-and-forget, no bloquea si falla)
      sendSellerPasswordReset(seller.name, seller.contact_email, linkData.properties.action_link)
        .catch((e) => console.warn('[invite] email send failed:', e));

      return res.json({ data: { ok: true, action: 'password_reset_sent', link: linkData.properties.action_link } });
    }

    // Sin cuenta — generar invite link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: seller.contact_email,
      options: {
        redirectTo: portalUrl,
        data: { seller_id: id, seller_name: seller.name, role: 'seller' },
      },
    });
    if (linkError) return res.status(400).json({ error: linkError.message });

    // Vincular el user_id generado por Supabase al seller
    await pool.query(
      `UPDATE sellers SET supabase_user_id = $1, updated_at = NOW() WHERE id = $2`,
      [linkData.user.id, id],
    );

    // Intentar enviar por email (fire-and-forget)
    sendSellerPortalInvite(seller.name, seller.contact_email, linkData.properties.action_link)
      .catch((e) => console.warn('[invite] email send failed:', e));

    res.json({ data: { ok: true, action: 'invite_sent', link: linkData.properties.action_link } });
  } catch (err) { next(err); }
});

// ─── Generador de QR ─────────────────────────────────────
// Devolvemos PNG por default. ?format=svg para vectorial. ?size=512 px (default 512).
adminSellersRouter.get('/:id/qr', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const seller = await getSeller(id);
    if (!seller) return res.status(404).json({ error: 'Not found' });

    const format = req.query.format === 'svg' ? 'svg' : 'png';
    const size = Math.min(2048, Math.max(128, Number(req.query.size ?? 512)));

    // URL pública con el code del vendedor
    const baseUrl = (typeof req.query.base_url === 'string' && req.query.base_url) || config.WEB_ORIGIN;
    const target = `${baseUrl.replace(/\/$/, '')}/?ref=${encodeURIComponent(seller.code)}`;

    const qrOptions: QRCode.QRCodeToBufferOptions = {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size,
      color: { dark: '#0d0a0a', light: '#ffffff' },
    };

    if (format === 'svg') {
      const svg = await QRCode.toString(target, { ...qrOptions, type: 'svg' });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Content-Disposition', `inline; filename="qr-${seller.code}.svg"`);
      return res.send(svg);
    }

    const buf = await QRCode.toBuffer(target, qrOptions);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-${seller.code}.png"`);
    res.send(buf);
  } catch (err) { next(err); }
});
