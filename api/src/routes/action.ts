import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { logPaymentEvent } from '../repos/orders.js';
import { notifyAdminsNewOrderPaid } from '../repos/notifications.js';
import { sendCashCollectedNotifications, sendSellerCancelledNotifications } from '../services/email.js';
import { getCancelWindow, checkOperationWindow } from '../services/settings.js';

export const actionRouter = Router();

const collectCurrencySchema = z.object({ currency: z.enum(['ARS', 'USD']).default('ARS') });

const TOKEN_RE = /^[0-9a-f-]{32,40}$/i;

// GET /api/action/:token — preview de la orden y la acción a ejecutar (sin auth)
actionRouter.get('/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'token_invalid' });

    const { rows } = await pool.query<{
      action: string; expires_at: string; used_at: string | null;
      order_public_id: string; status: string; payment_method: string;
      customer_name: string; option_name: string; service_date: string;
      total_ars: number; seller_name: string;
    }>(
      `SELECT t.action, t.expires_at, t.used_at,
              o.public_id AS order_public_id, o.status::text AS status, o.payment_method,
              o.customer_name, o.total_ars::float AS total_ars,
              oi.option_name_snapshot AS option_name,
              to_char(oi.service_date, 'DD/MM/YYYY') AS service_date,
              s.name AS seller_name
         FROM order_action_tokens t
         JOIN orders o ON o.id = t.order_id
         JOIN order_items oi ON oi.order_id = o.id
         JOIN sellers s ON s.id = t.seller_id
        WHERE t.token = $1
        LIMIT 1`,
      [token],
    );

    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'token_not_found' });
    if (row.used_at) return res.status(410).json({ error: 'token_used' });
    if (new Date(row.expires_at) < new Date()) return res.status(410).json({ error: 'token_expired' });

    res.json({
      data: {
        action: row.action,
        seller_name: row.seller_name,
        order: {
          public_id: row.order_public_id,
          status: row.status,
          payment_method: row.payment_method,
          customer_name: row.customer_name,
          option_name: row.option_name,
          service_date: row.service_date,
          total_ars: row.total_ars,
        },
      },
    });
  } catch (err) { next(err); }
});

// POST /api/action/:token — ejecuta la acción (sin auth; el token es la autorización)
actionRouter.post('/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'token_invalid' });

    const { rows } = await pool.query<{
      token_id: number; action: string; expires_at: string; used_at: string | null;
      order_id: number; status: string; payment_method: string;
      net_settled_at: string | null; service_date: string; seller_id: number;
    }>(
      `SELECT t.id AS token_id, t.action, t.expires_at, t.used_at,
              o.id AS order_id, o.status::text AS status, o.payment_method,
              a.net_settled_at,
              oi.service_date::text AS service_date,
              t.seller_id
         FROM order_action_tokens t
         JOIN orders o ON o.id = t.order_id
         JOIN order_attributions a ON a.order_id = o.id
         JOIN order_items oi ON oi.order_id = o.id
        WHERE t.token = $1
        LIMIT 1`,
      [token],
    );

    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'token_not_found' });
    if (row.used_at) return res.status(410).json({ error: 'token_used' });
    if (new Date(row.expires_at) < new Date()) return res.status(410).json({ error: 'token_expired' });

    // Marcar el token como usado antes de ejecutar (previene doble ejecución por doble-click)
    const { rowCount } = await pool.query(
      `UPDATE order_action_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
      [row.token_id],
    );
    if (!rowCount) return res.status(410).json({ error: 'token_used' });

    if (row.action === 'collect') {
      if (row.payment_method !== 'cash') {
        return res.status(400).json({ error: 'order_not_cash' });
      }
      if (row.status !== 'pending') {
        return res.status(409).json({ error: 'order_not_actionable', current_status: row.status });
      }
      const parsedCurrency = collectCurrencySchema.safeParse(req.body ?? {});
      const currency = parsedCurrency.success ? parsedCurrency.data.currency : 'ARS';

      await pool.query(
        `UPDATE orders SET status = 'paid', paid_at = NOW(), cash_collected_at = NOW(), cash_collected_currency = $2 WHERE id = $1`,
        [row.order_id, currency],
      );
      await logPaymentEvent(row.order_id, 'cash_collected_by_seller', null, {
        seller_id: row.seller_id, via: 'email_token', currency,
      });
      notifyAdminsNewOrderPaid(row.order_id).catch((e) =>
        console.error('[notif] notifyAdminsNewOrderPaid failed:', e),
      );
      sendCashCollectedNotifications(row.order_id, 'seller').catch((e) =>
        console.error('[action-token] collect email failed:', e),
      );

    } else if (row.action === 'cancel') {
      if (!['pending', 'paid'].includes(row.status)) {
        return res.status(409).json({ error: 'order_not_actionable', current_status: row.status });
      }
      if (row.net_settled_at) {
        return res.status(409).json({ error: 'order_settled' });
      }
      const cancelCheck = checkOperationWindow(await getCancelWindow(), row.service_date);
      if (cancelCheck.blocked) {
        return res.status(409).json({ error: 'outside_cancel_window', message: cancelCheck.message });
      }

      await pool.query(
        `UPDATE orders
            SET status = 'cancelled', cancelled_by = 'seller', cancel_reason = NULL,
                cancelled_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [row.order_id],
      );
      await logPaymentEvent(row.order_id, 'order_cancelled', null, {
        actor: 'seller', seller_id: row.seller_id, reason: null, via: 'email_token',
      });
      sendSellerCancelledNotifications(row.order_id, null).catch((e) =>
        console.error('[action-token] cancel email failed:', e),
      );

    } else {
      return res.status(400).json({ error: 'unknown_action' });
    }

    res.json({ data: { ok: true, action: row.action } });
  } catch (err) { next(err); }
});
