import { pool } from '../db.js';
import { notifySeller, notifyAdmins } from '../services/sseNotifier.js';

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

export async function deleteNotification(id: number, sellerId: number): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM seller_notifications WHERE id = $1 AND seller_id = $2`,
    [id, sellerId],
  );
  return (result.rowCount ?? 0) > 0;
}

function fmtArs(n: number): string {
  return `ARS ${Math.round(n).toLocaleString('es-AR')}`;
}

// Push en vivo (sin persistir) a los admins con el panel de órdenes abierto, cuando
// una orden pasa a 'paid' — por Mercado Pago o porque un vendedor confirmó el cobro
// en efectivo. A diferencia de las notificaciones del vendedor, esto no se guarda en
// una tabla: es solo para el toast + refresco en vivo de la lista de órdenes.
export async function notifyAdminsNewOrderPaid(orderId: number): Promise<void> {
  const { rows } = await pool.query<{
    public_id: string; customer_name: string; option_name: string | null;
    total_ars: number; payment_method: string; seller_name: string | null;
  }>(
    `SELECT o.public_id, o.customer_name,
            oi.option_name_snapshot AS option_name,
            o.total_ars::float AS total_ars, o.payment_method,
            s.name AS seller_name
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN order_attributions a ON a.order_id = o.id
       LEFT JOIN sellers s ON s.id = a.seller_id
      WHERE o.id = $1
      ORDER BY oi.id
      LIMIT 1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return;

  notifyAdmins('new_order_paid', {
    order_id: orderId,
    public_id: row.public_id,
    customer_name: row.customer_name,
    option_name: row.option_name,
    total_ars: row.total_ars,
    payment_method: row.payment_method,
    seller_name: row.seller_name,
  });
}

// Crea notificación para el vendedor atribuido cuando una orden pasa a 'paid'.
export async function createOrderPaidNotification(orderId: number): Promise<void> {
  const { rows } = await pool.query<{
    seller_id: number;
    commission_amount_ars: number;
    product_name: string;
    option_name: string;
    service_date: string;
    total_ars: number;
  }>(
    `SELECT
       a.seller_id,
       a.commission_amount_ars::float AS commission_amount_ars,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot  AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       o.total_ars::float AS total_ars
     FROM order_attributions a
     JOIN orders o  ON o.id  = a.order_id
     JOIN order_items oi ON oi.order_id = o.id
    WHERE a.order_id = $1
    LIMIT 1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return;

  await createNotification({
    seller_id: row.seller_id,
    type: 'order_paid',
    title: '¡Nueva venta confirmada!',
    body: `Tu código generó una venta de ${fmtArs(row.total_ars)} para "${row.option_name}" — ${row.service_date}. Te corresponde una comisión de ${fmtArs(row.commission_amount_ars)}.`,
    metadata: { order_id: orderId, product_name: row.product_name, total_ars: row.total_ars },
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
    total_ars: number;
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
       o.total_ars::float AS total_ars,
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
    body: `${row.customer_name} reservó "${row.option_name}" para el ${row.service_date} (${pax} pax · ${fmtArs(row.total_ars)}). Coordiná el cobro y marcá la reserva como Cobrada.`,
    metadata: { order_id: orderId, order_public_id: row.public_id, product_name: row.product_name, total_ars: row.total_ars, service_date: row.service_date },
  });
}

// Crea notificación cuando una reserva en efectivo caduca por no marcarse el cobro en 24 hs.
export async function createOrderExpiredNotification(orderId: number): Promise<void> {
  const { rows } = await pool.query<{
    seller_id: number;
    public_id: string;
    customer_name: string;
    option_name: string;
    service_date: string;
    total_ars: number;
  }>(
    `SELECT
       a.seller_id,
       o.public_id,
       o.customer_name,
       oi.option_name_snapshot AS option_name,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       o.total_ars::float AS total_ars
     FROM order_attributions a
     JOIN orders o  ON o.id  = a.order_id
     JOIN order_items oi ON oi.order_id = o.id
    WHERE a.order_id = $1
    LIMIT 1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return;

  await createNotification({
    seller_id: row.seller_id,
    type: 'order_expired',
    title: '⏰ Reserva caducada',
    body: `La reserva de ${row.customer_name} para "${row.option_name}" (${row.service_date}) caducó porque no se marcó el cobro dentro de las 24 hs. Si la cobraste igual, contactá al equipo.`,
    metadata: { order_id: orderId, order_public_id: row.public_id, total_ars: row.total_ars, service_date: row.service_date },
  });
}

// Efectivo: notifica al vendedor cuando el operador registra que rindió el neto.
export async function createNetSettledNotification(
  sellerId: number,
  orderIds: number[],
  totalNetArs: number,
): Promise<void> {
  const count = orderIds.length;
  await createNotification({
    seller_id: sellerId,
    type: 'net_settled',
    title: 'Rendición registrada',
    body: `Registramos la rendición del neto de ${count} venta${count !== 1 ? 's' : ''} en efectivo por un total de ${fmtArs(totalNetArs)}. Esas operaciones quedan como "Rendidas".`,
    metadata: { order_ids: orderIds, total_net_ars: totalNetArs, orders_count: count },
  });
}

// Notifica al vendedor cuando el ADMIN reduce pasajeros de una orden suya en efectivo.
// El vendedor no lo hizo él mismo, así que necesita enterarse aunque no haya refrescado
// el portal — mismo canal (in-app + push en vivo) que ya usan liquidación y rendición.
export async function createOrderReducedByAdminNotification(input: {
  sellerId: number;
  orderId: number;
  orderPublicId: string;
  customerName: string;
  optionName: string;
  serviceDate: string;
  newAdults: number;
  newChildren: number;
  refundArs: number;
}): Promise<void> {
  await createNotification({
    seller_id: input.sellerId,
    type: 'order_modified_by_admin',
    title: '✎ El equipo modificó una reserva tuya',
    body: `Redujimos pasajeros en la reserva de ${input.customerName} para "${input.optionName}" (${input.serviceDate}). Devolvimos ${fmtArs(input.refundArs)} al pasajero en tu nombre. Ahora queda en ${input.newAdults + input.newChildren} pax.`,
    metadata: {
      order_id: input.orderId, order_public_id: input.orderPublicId,
      refund_ars: input.refundArs, new_adults: input.newAdults, new_children: input.newChildren,
    },
  });
}

// Notifica al vendedor cuando el ADMIN crea una ampliación en efectivo pendiente de
// cobro sobre una orden suya: el vendedor tiene que ir a cobrarla, así que es la
// notificación más urgente de las dos (requiere una acción, no solo enterarse).
export async function createCashAddonCreatedByAdminNotification(input: {
  sellerId: number;
  orderId: number;
  orderPublicId: string;
  customerName: string;
  optionName: string;
  serviceDate: string;
  extraAdults: number;
  extraChildren: number;
  chargeArs: number;
}): Promise<void> {
  const extraPax = input.extraAdults + input.extraChildren;
  await createNotification({
    seller_id: input.sellerId,
    type: 'cash_addon_created_by_admin',
    title: '💵 Ampliación pendiente de cobro',
    body: `Sumamos ${extraPax} pax a la reserva de ${input.customerName} para "${input.optionName}" (${input.serviceDate}). Coordiná el cobro de ${fmtArs(input.chargeArs)} y marcala como cobrada desde "Mis ventas".`,
    metadata: {
      order_id: input.orderId, order_public_id: input.orderPublicId,
      charge_ars: input.chargeArs, extra_adults: input.extraAdults, extra_children: input.extraChildren,
    },
  });
}

// Crea notificación cuando el admin marca comisiones como liquidadas.
export async function createCommissionPaidNotification(
  sellerId: number,
  orderIds: number[],
  totalCommissionArs: number,
): Promise<void> {
  const count = orderIds.length;
  await createNotification({
    seller_id: sellerId,
    type: 'commission_paid',
    title: 'Liquidación procesada',
    body: `El equipo de Tangos y Milongas Tickets liquidó ${count} venta${count !== 1 ? 's' : ''} por un total de ${fmtArs(totalCommissionArs)}. El monto ya está disponible en tu historial de liquidaciones. Ante cualquier duda, contactanos por WhatsApp.`,
    metadata: { order_ids: orderIds, total_ars: totalCommissionArs, orders_count: count },
  });
}
