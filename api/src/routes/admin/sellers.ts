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
import { hashPin } from '../../services/pin.js';
import { listSellerMemberStats, resetSellerMemberPinByAdmin, getSellerPeriodStats } from '../../repos/sellerMembers.js';
import { requireRole } from '../../middleware/requireAdmin.js';
import { sendSellerPortalInvite, sendSellerPasswordReset, sendSellerCommissionPaid, sendNetSettledConfirmation } from '../../services/email.js';
import { createCommissionPaidNotification, createNetSettledNotification } from '../../repos/notifications.js';

export const adminSellersRouter = Router();

const sellerSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Solo letras, números, guion y guion bajo (3-32)'),
  name: z.string().min(2).max(160),
  contact_email: z.string().email().max(160).optional().nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  kind: z.string().max(40).optional().nullable(),
  // Ya no es la fuente de verdad de la comisión (ver product_kind_commission_adjustments +
  // settings.seller_kind_base_commission) -- se acepta si alguien todavía lo manda, pero
  // el admin ya no lo edita desde la UI.
  commission_percent: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
  is_permanent: z.boolean().optional(),
  card_enabled: z.boolean().optional(),
  is_house: z.boolean().optional(),
  landing_customization_enabled: z.boolean().optional(),
  team_enabled: z.boolean().optional(),
  team_pin_required: z.boolean().optional(),
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

// Un contact_email de vendedor eventualmente se convierte en el email real de su cuenta
// de Supabase Auth (ver /invite más abajo) — si ya lo tiene otro admin o vendedor, avisamos
// acá mismo al guardar en vez de dejar que explote recién cuando alguien apriete "invitar".
async function findEmailOwner(
  email: string,
  excludeSellerId?: number,
): Promise<{ kind: 'admin' | 'seller'; label: string } | null> {
  const [adminRows, sellerRows] = await Promise.all([
    pool.query<{ email: string }>(`SELECT email FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email]),
    pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM sellers WHERE LOWER(contact_email) = LOWER($1) AND id <> $2 LIMIT 1`,
      [email, excludeSellerId ?? -1],
    ),
  ]);
  if (adminRows.rows[0]) return { kind: 'admin', label: `el admin ${adminRows.rows[0].email}` };
  if (sellerRows.rows[0]) return { kind: 'seller', label: `el recomendador "${sellerRows.rows[0].name}"` };
  return null;
}

adminSellersRouter.post('/', async (req, res, next) => {
  try {
    const parsed = sellerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    if (parsed.data.contact_email) {
      const owner = await findEmailOwner(parsed.data.contact_email);
      if (owner) {
        return res.status(409).json({ error: `Ese email ya está registrado para ${owner.label}. Usá un email exclusivo para este recomendador.` });
      }
    }
    const id = await createSeller(parsed.data);
    const seller = await getSeller(id);
    res.status(201).json({ data: seller });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un recomendador con ese código' });
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
    // Solo valida si el email realmente está cambiando — evita falsos positivos al re-guardar
    // sin tocarlo (ej. alguien con doble rol admin+vendedor por el mismo email, ya aceptado).
    if (parsed.data.contact_email) {
      const current = await getSeller(id);
      if (current && current.contact_email?.toLowerCase() !== parsed.data.contact_email.toLowerCase()) {
        const owner = await findEmailOwner(parsed.data.contact_email, id);
        if (owner) {
          return res.status(409).json({ error: `Ese email ya está registrado para ${owner.label}. Usá un email exclusivo para este recomendador.` });
        }
      }
    }
    // Nunca pueden quedar los dos medios de pago apagados a la vez -- calculamos el
    // estado resultante (lo que cambia + lo que ya tenía) antes de guardar, para dar un
    // error claro acá en vez de que reviente en el constraint de la base.
    if (parsed.data.is_permanent === false || parsed.data.card_enabled === false) {
      const current = await getSeller(id);
      if (!current) return res.status(404).json({ error: 'Not found' });
      const willBePermanent = parsed.data.is_permanent ?? current.is_permanent;
      const willBeCardEnabled = parsed.data.card_enabled ?? current.card_enabled;
      if (!willBePermanent && !willBeCardEnabled) {
        return res.status(400).json({ error: 'Tiene que quedar al menos un medio de pago habilitado (Tarjeta o Pago manual).' });
      }
    }
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

// ─── PIN de administrador (equipo/Mi equipo del vendedor) ─
// Solo nosotros lo cargamos/reseteamos acá. Sin este PIN, el vendedor no puede
// crear ni editar sub-vendedores en su portal — ver requireMemberIfTeamExists
// y routes/seller/members.ts. Restringido a super_admin: es la llave maestra de
// todo "Mi equipo" de esa cuenta, no algo que cualquier operador deba poder tocar.
const setAdminPinSchema = z.object({
  admin_pin: z.string().regex(/^\d{4,6}$/, 'El PIN debe tener entre 4 y 6 dígitos'),
});

adminSellersRouter.post('/:id/admin-pin', requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = setAdminPinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const { rowCount } = await pool.query(
      `UPDATE sellers SET admin_pin_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hashPin(parsed.data.admin_pin), id],
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// GET /api/admin/sellers/:id/members — sub-vendedores (ej. conserjes) que el vendedor
// cargó en su equipo, con sus ventas atribuidas. Solo lectura: el admin no crea ni
// edita miembros acá (eso lo autogestiona el vendedor con su PIN admin).
adminSellersRouter.get('/:id/members', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const rows = await listSellerMemberStats(id);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

const periodStatsSchema = z.object({
  member_id: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/admin/sellers/:id/stats — mismas métricas que /members pero con paridad
// completa a GET /me del portal del vendedor (facturación/comisión/neto a rendir),
// recortable por sub-vendedor y/o período. Espejo de GET /me/stats del lado seller
// (misma función de repo, acá con el :id de la URL en vez del seller de la sesión).
adminSellersRouter.get('/:id/stats', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const parsed = periodStatsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Parámetros inválidos' });
    const { member_id, from, to } = parsed.data;
    const stats = await getSellerPeriodStats(id, { memberId: member_id, from, to });
    res.json({ data: stats });
  } catch (err) { next(err); }
});

// POST /api/admin/sellers/:id/members/:memberId/reset-pin — blanqueo de emergencia:
// le genera un PIN nuevo a un sub-vendedor puntual sin pasar por el vendedor (ni su
// PIN de administrador ni el email de la persona). Para cuando el equipo quedó
// bloqueado (perdió el PIN, no tiene email cargado). Restringido a super_admin.
adminSellersRouter.post('/:id/members/:memberId/reset-pin', requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(memberId) || memberId <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const result = await resetSellerMemberPinByAdmin(id, memberId);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result });
  } catch (err) { next(err); }
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
    if (!seller.contact_email) return res.status(400).json({ error: 'El recomendador no tiene email de contacto registrado' });
    if (!seller.is_active) return res.status(400).json({ error: 'El recomendador está inactivo' });

    const portalUrl = `${config.WEB_ORIGIN.replace(/\/$/, '')}/seller/login`;

    if (seller.supabase_user_id) {
      // Guardia de seguridad: antes de reusar el supabase_user_id guardado, confirmamos
      // que sigue siendo realmente la cuenta de ESTE vendedor. Si por un dato viejo/mal
      // cargado terminó apuntando a otra cuenta real (un admin u otro vendedor con un
      // email distinto), el paso de abajo le pisaría el email a esa cuenta ajena y le
      // robaría el login. Si coincide el email (misma persona con doble rol admin+
      // vendedor), no hay problema y seguimos normal.
      const [adminOwner, sellerOwner] = await Promise.all([
        pool.query<{ email: string }>(`SELECT email FROM admin_users WHERE id = $1 LIMIT 1`, [seller.supabase_user_id]),
        pool.query<{ id: number; contact_email: string | null }>(
          `SELECT id, contact_email FROM sellers WHERE supabase_user_id = $1 AND id <> $2 LIMIT 1`,
          [seller.supabase_user_id, id],
        ),
      ]);
      const conflictingAdmin = adminOwner.rows[0] && adminOwner.rows[0].email !== seller.contact_email
        ? adminOwner.rows[0] : null;
      const conflictingSeller = sellerOwner.rows[0] && sellerOwner.rows[0].contact_email !== seller.contact_email
        ? sellerOwner.rows[0] : null;
      if (conflictingAdmin || conflictingSeller) {
        return res.status(409).json({
          error: `El acceso guardado para este recomendador está vinculado a otra cuenta real (${
            conflictingAdmin ? `admin ${conflictingAdmin.email}` : `recomendador #${conflictingSeller!.id}`
          }) — reenviar la invitación le pisaría el login a esa persona. Contactá a soporte técnico para corregir el vínculo antes de continuar.`,
        });
      }

      // Ya tiene cuenta. Sincronizamos el email del usuario de Auth con el contact_email
      // actual: si se cambió el email después de crear la cuenta, el usuario de Auth
      // seguía con el viejo y el recovery fallaba con "User with this email not found".
      const { error: syncErr } = await supabaseAdmin.auth.admin.updateUserById(seller.supabase_user_id, {
        email: seller.contact_email,
        email_confirm: true,
      });
      if (syncErr) {
        return res.status(409).json({
          error: `No se pudo asignar el email "${seller.contact_email}" al portal del recomendador: ${syncErr.message}. Es probable que ya esté en uso por otro usuario (el admin u otro recomendador). Usá un email exclusivo para este recomendador.`,
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
        error: `No se pudo generar la invitación para "${seller.contact_email}": ${linkError.message}. Puede que ese email ya esté registrado como otro usuario (el admin u otro recomendador). Usá un email exclusivo para este recomendador.`,
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

    // URL pública con el code del vendedor. Siempre WEB_ORIGIN (no el origin del browser del
    // admin): así un QR generado durante una migración de dominio nunca queda apuntando al
    // dominio viejo solo porque el admin todavía tenía esa pestaña abierta.
    const target = `${config.WEB_ORIGIN.replace(/\/$/, '')}/?ref=${encodeURIComponent(seller.code)}`;

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
