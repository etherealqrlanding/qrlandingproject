import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import {
  createSeller, deactivateSeller, deleteSeller, getSeller, listSellerOrders,
  listSellersWithStats, markCommissionsPaid, markNetSettled, updateSeller,
} from '../../repos/sellers.js';
import { config } from '../../config.js';
import { supabaseAdmin } from '../../services/supabase.js';
import { pool } from '../../db.js';
import { sendSellerPortalInvite, sendSellerPasswordReset, sendSellerCommissionPaid, sendNetSettledConfirmation } from '../../services/email.js';
import { createCommissionPaidNotification, createNetSettledNotification } from '../../repos/notifications.js';

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
// Sin ?force=true: falla con 409 si el vendedor tiene ventas (incluye el conteo en details).
// Con ?force=true: borra también todas las ventas que trajo (cascada).
adminSellersRouter.delete('/:id/permanent', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const force = req.query.force === 'true';

    const result = await deleteSeller(id, { force });
    if (!result.deleted) return res.status(404).json({ error: 'Not found' });

    // Si tenía cuenta en Supabase Auth, la eliminamos también
    if (result.supabase_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(result.supabase_user_id).catch((err) => {
        console.warn('No se pudo eliminar el usuario de Supabase Auth:', err);
      });
    }

    res.json({ data: { ok: true, deleted_orders: result.deleted_orders } });
  } catch (err) {
    if ((err as Error & { code?: string }).code === 'HAS_ORDERS') {
      const orderCount = (err as Error & { orderCount?: number }).orderCount ?? 0;
      return res.status(409).json({ error: (err as Error).message, details: { order_count: orderCount } });
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
    const settlement = req.query.settlement === 'pending' || req.query.settlement === 'settled'
      ? req.query.settlement
      : undefined;
    const rows = await listSellerOrders(id, { status, settlement });
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
      // Sumar comisiones (ARS y USD) recién marcadas para la notificación in-app y el email
      const { rows: sumRows } = await pool.query<{ total_ars: string; total_usd: string }>(
        `SELECT SUM(a.commission_amount_ars)::text AS total_ars,
                SUM(a.commission_amount_usd)::text AS total_usd
           FROM order_attributions a
          WHERE a.seller_id = $1
            AND a.order_id = ANY($2::int[])
            AND a.paid_to_seller_at IS NOT NULL`,
        [id, parsed.data.order_ids],
      );
      const totalArs = parseFloat(sumRows[0]?.total_ars ?? '0');
      const totalUsd = parseFloat(sumRows[0]?.total_usd ?? '0');

      // Notificación in-app (fire-and-forget)
      createCommissionPaidNotification(id, parsed.data.order_ids, totalArs)
        .catch((e) => console.error('[notif] createCommissionPaidNotification failed:', e));

      // Email al vendedor + copia al admin, informando que se confirmó el pago.
      const seller = await getSeller(id);
      if (seller?.contact_email) {
        sendSellerCommissionPaid({
          sellerId: id,
          sellerName: seller.name,
          sellerEmail: seller.contact_email,
          ordersCount: updated,
          totalCommissionUsd: totalUsd,
          totalCommissionArs: totalArs,
          portalUrl: `${config.WEB_ORIGIN}/seller/ventas`,
        }).catch((e) => console.error('[email] sendSellerCommissionPaid failed:', e));
      }
    }

    res.json({ data: { updated } });
  } catch (err) { next(err); }
});

// ─── Efectivo: marcar neto como rendido por el vendedor ──
adminSellersRouter.post('/:id/net-settlements/mark-settled', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = markPaidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const updated = await markNetSettled(id, parsed.data.order_ids);

    if (updated > 0) {
      // Neto en ARS: usa net_total_usd_snapshot * exchange_rate si está seteado,
      // si no cae a total_ars - commission_amount_ars (fix del bug 0.00 cuando no hay precio neto configurado)
      const { rows: sumRows } = await pool.query<{ total: string }>(
        `SELECT SUM(
           COALESCE(a.net_total_usd_snapshot * o.exchange_rate_used, o.total_ars - a.commission_amount_ars)
         )::text AS total
           FROM order_attributions a
           JOIN orders o ON o.id = a.order_id
          WHERE a.seller_id = $1
            AND a.order_id = ANY($2::int[])
            AND a.net_settled_at IS NOT NULL`,
        [id, parsed.data.order_ids],
      );
      const totalNetArs = parseFloat(sumRows[0]?.total ?? '0');
      createNetSettledNotification(id, parsed.data.order_ids, totalNetArs)
        .catch((e) => console.error('[notif] createNetSettledNotification failed:', e));

      // Email al vendedor + copia al admin, confirmando que la rendición en efectivo llegó.
      const seller = await getSeller(id);
      if (seller?.contact_email) {
        sendNetSettledConfirmation({
          sellerId: id,
          sellerName: seller.name,
          sellerEmail: seller.contact_email,
          ordersCount: updated,
          totalNetArs,
          portalUrl: `${config.WEB_ORIGIN}/seller/ventas`,
        }).catch((e) => console.error('[email] sendNetSettledConfirmation failed:', e));
      }
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
      // Ya tiene cuenta. Sincronizamos el email del usuario de Auth con el contact_email
      // actual: si se cambió el email después de crear la cuenta, el usuario de Auth
      // seguía con el viejo y el recovery fallaba con "User with this email not found".
      const { error: syncErr } = await supabaseAdmin.auth.admin.updateUserById(seller.supabase_user_id, {
        email: seller.contact_email,
        email_confirm: true,
      });
      if (syncErr) {
        return res.status(409).json({
          error: `No se pudo asignar el email "${seller.contact_email}" al portal del vendedor: ${syncErr.message}. Es probable que ya esté en uso por otro usuario (el admin u otro vendedor). Usá un email exclusivo para este vendedor.`,
        });
      }

      // Ya tiene cuenta — generar link de reset
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: seller.contact_email,
        options: { redirectTo: portalUrl },
      });
      if (linkError) return res.status(400).json({ error: linkError.message });

      // Esperamos el envío para reportar si realmente salió (no fire-and-forget).
      const emailResult = await sendSellerPasswordReset(seller.name, seller.contact_email, linkData.properties.action_link);

      return res.json({
        data: {
          ok: true,
          action: 'password_reset_sent',
          link: linkData.properties.action_link,
          email_sent: emailResult.sent,
          email_error: emailResult.error ?? null,
        },
      });
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
    if (linkError) {
      return res.status(409).json({
        error: `No se pudo generar la invitación para "${seller.contact_email}": ${linkError.message}. Puede que ese email ya esté registrado como otro usuario (el admin u otro vendedor). Usá un email exclusivo para este vendedor.`,
      });
    }

    // Vincular el user_id generado por Supabase al seller
    await pool.query(
      `UPDATE sellers SET supabase_user_id = $1, updated_at = NOW() WHERE id = $2`,
      [linkData.user.id, id],
    );

    // Esperamos el envío para reportar si realmente salió (no fire-and-forget).
    const emailResult = await sendSellerPortalInvite(seller.name, seller.contact_email, linkData.properties.action_link);

    res.json({
      data: {
        ok: true,
        action: 'invite_sent',
        link: linkData.properties.action_link,
        email_sent: emailResult.sent,
        email_error: emailResult.error ?? null,
      },
    });
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
