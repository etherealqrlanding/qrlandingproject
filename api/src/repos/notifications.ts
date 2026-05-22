import { pool } from '../db.js';
import { notifySeller } from '../services/sseNotifier.js';

export interface SellerNotification {
  id: number;
  seller_id: number;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export async function createNotification(input: {
  seller_id: number;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { rows } = await pool.query<SellerNotification>(
    `INSERT INTO seller_notifications (seller_id, type, title, body, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, seller_id, type, title, body, metadata, read_at, created_at`,
    [input.seller_id, input.type, input.title, input.body, JSON.stringify(input.metadata ?? {})],
  );
  const row = rows[0];
  if (row) {
    notifySeller(input.seller_id, 'notification', row);
  }
}

export async function listNotifications(sellerId: number, limit = 50): Promise<SellerNotification[]> {
  const { rows } = await pool.query<SellerNotification>(
    `SELECT id, seller_id, type, title, body, metadata, read_at, created_at
       FROM seller_notifications
      WHERE seller_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [sellerId, limit],
  );
  return rows;
}

export async function markAllRead(sellerId: number): Promise<number> {
  const result = await pool.query(
    `UPDATE seller_notifications
        SET read_at = NOW()
      WHERE seller_id = $1 AND read_at IS NULL`,
    [sellerId],
  );
  return result.rowCount ?? 0;
}

export async function getUnreadCount(sellerId: number): Promise<number> {
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM seller_notifications
      WHERE seller_id = $1 AND read_at IS NULL`,
    [sellerId],
  );
  return parseInt(rows[0]?.cnt ?? '0', 10);
}

// Crea notificación para el vendedor atribuido cuando una orden pasa a 'paid'.
// Llama a la DB internamente para resolver la atribución.
export async function createOrderPaidNotification(orderId: number): Promise<void> {
  const { rows } = await pool.query<{
    seller_id: number;
    commission_amount_usd: number;
    product_name: string;
    option_name: string;
    service_date: string;
    total_usd: number;
  }>(
    `SELECT
       a.seller_id,
       a.commission_amount_usd::float AS commission_amount_usd,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot  AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       o.total_usd::float AS total_usd
     FROM order_attributions a
     JOIN orders o  ON o.id  = a.order_id
     JOIN order_items oi ON oi.order_id = o.id
    WHERE a.order_id = $1
    LIMIT 1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return; // orden sin atribución → no hay vendedor que notificar

  await createNotification({
    seller_id: row.seller_id,
    type: 'order_paid',
    title: '¡Nueva venta confirmada!',
    body: `Tu código generó una venta de USD ${row.total_usd.toFixed(2)} para "${row.option_name}" — ${row.service_date}. Te corresponde una comisión de USD ${row.commission_amount_usd.toFixed(2)}.`,
    metadata: { order_id: orderId, product_name: row.product_name, total_usd: row.total_usd },
  });
}

// Crea notificación cuando un cliente reserva indicando pago al vendedor (checkout público).
export async function createCashBookingNotification(orderId: number): Promise<void> {
  const { rows } = await pool.query<{
    seller_id: number;
    public_id: string;
    customer_name: string;
    product_name: string;
    option_name: string;
    service_date: string;
    total_usd: number;
    adults: number;
    children: number;
  }>(
    `SELECT
       a.seller_id,
       o.public_id,
       o.customer_name,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot  AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       o.total_usd::float AS total_usd,
       oi.adults, oi.children
     FROM order_attributions a
     JOIN orders o  ON o.id  = a.order_id
     JOIN order_items oi ON oi.order_id = o.id
    WHERE a.order_id = $1
    LIMIT 1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return;

  const pax = row.adults + row.children;
  await createNotification({
    seller_id: row.seller_id,
    type: 'cash_booking_pending',
    title: '💵 Nueva reserva para cobrar',
    body: `${row.customer_name} reservó "${row.option_name}" para el ${row.service_date} (${pax} pax · USD ${row.total_usd.toFixed(2)}). Coordiná el cobro y marcá la reserva como Cobrada.`,
    metadata: { order_id: orderId, order_public_id: row.public_id, product_name: row.product_name, total_usd: row.total_usd, service_date: row.service_date },
  });
}

// Crea notificación cuando el admin marca comisiones como liquidadas.
export async function createCommissionPaidNotification(
  sellerId: number,
  orderIds: number[],
  totalCommissionUsd: number,
): Promise<void> {
  const count = orderIds.length;
  await createNotification({
    seller_id: sellerId,
    type: 'commission_paid',
    title: 'Liquidación procesada',
    body: `El equipo de Ethereal Tours liquidó ${count} venta${count !== 1 ? 's' : ''} por un total de USD ${totalCommissionUsd.toFixed(2)}. El monto ya está disponible en tu historial de liquidaciones. Ante cualquier duda, contactanos por WhatsApp.`,
    metadata: { order_ids: orderIds, total_usd: totalCommissionUsd, orders_count: count },
  });
}
