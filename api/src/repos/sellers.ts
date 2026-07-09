import { pool } from '../db.js';

export interface SellerInput {
  code: string;
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  kind?: string | null;
  commission_percent: number;
  notes?: string | null;
  is_active?: boolean;
}

export interface SellerWithStats {
  id: number;
  code: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  kind: string | null;
  commission_percent: string;            // numeric viene como string
  notes: string | null;
  is_active: boolean;
  created_at: string;
  // stats agregados
  orders_total: number;                  // todas las órdenes atribuidas
  orders_paid: number;                   // órdenes en estado 'paid'
  revenue_paid_usd: number;              // suma total_usd de órdenes pagadas atribuidas
  revenue_paid_ars: number;
  commission_paid_usd: number;           // comisión acumulada de órdenes pagadas (ambos métodos)
  commission_paid_ars: number;
  // MP: comisión que NOSOTROS le debemos al vendedor y todavía no liquidamos (paid_to_seller_at NULL)
  commission_pending_payment_usd: number;
  commission_pending_payment_ars: number;
  // Efectivo: neto que el VENDEDOR nos debe liquidar y todavía no rindió (net_settled_at NULL)
  net_pending_settlement_usd: number;
  net_pending_settlement_ars: number;
}

export async function listSellersWithStats(): Promise<SellerWithStats[]> {
  const { rows } = await pool.query<SellerWithStats>(
    `SELECT
       s.id, s.code, s.name, s.contact_email, s.contact_phone, s.kind,
       s.commission_percent::text AS commission_percent,
       s.notes, s.is_active, s.created_at,
       COALESCE(stats.orders_total, 0)::int AS orders_total,
       COALESCE(stats.orders_paid, 0)::int AS orders_paid,
       COALESCE(stats.revenue_paid_usd, 0)::float AS revenue_paid_usd,
       COALESCE(stats.revenue_paid_ars, 0)::float AS revenue_paid_ars,
       COALESCE(stats.commission_paid_usd, 0)::float AS commission_paid_usd,
       COALESCE(stats.commission_paid_ars, 0)::float AS commission_paid_ars,
       COALESCE(stats.commission_pending_payment_usd, 0)::float AS commission_pending_payment_usd,
       COALESCE(stats.commission_pending_payment_ars, 0)::float AS commission_pending_payment_ars,
       COALESCE(stats.net_pending_settlement_usd, 0)::float AS net_pending_settlement_usd,
       COALESCE(stats.net_pending_settlement_ars, 0)::float AS net_pending_settlement_ars
       FROM sellers s
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE o.id IS NOT NULL) AS orders_total,
           COUNT(*) FILTER (WHERE o.status = 'paid') AS orders_paid,
           SUM(o.total_usd) FILTER (WHERE o.status = 'paid') AS revenue_paid_usd,
           SUM(o.total_ars) FILTER (WHERE o.status = 'paid') AS revenue_paid_ars,
           SUM(a.commission_amount_usd) FILTER (WHERE o.status = 'paid') AS commission_paid_usd,
           SUM(a.commission_amount_ars) FILTER (WHERE o.status = 'paid') AS commission_paid_ars,
           -- MP: lo que le debemos liquidar al vendedor (comisión pendiente)
           SUM(a.commission_amount_usd) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NULL
           ) AS commission_pending_payment_usd,
           SUM(a.commission_amount_ars) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'mercadopago' AND a.paid_to_seller_at IS NULL
           ) AS commission_pending_payment_ars,
           -- Efectivo: neto que el vendedor nos debe rendir (pendiente)
           SUM(a.net_total_usd_snapshot) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'cash' AND a.net_settled_at IS NULL
           ) AS net_pending_settlement_usd,
           SUM(a.net_total_usd_snapshot * o.exchange_rate_used) FILTER (
             WHERE o.status = 'paid' AND o.payment_method = 'cash' AND a.net_settled_at IS NULL
           ) AS net_pending_settlement_ars
           FROM order_attributions a
           JOIN orders o ON o.id = a.order_id
          WHERE a.seller_id = s.id
       ) stats ON TRUE
      ORDER BY s.is_active DESC, s.name`,
  );
  return rows;
}

export async function getSeller(id: number) {
  const { rows } = await pool.query(
    `SELECT * FROM sellers WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createSeller(input: SellerInput): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO sellers (code, name, contact_email, contact_phone, kind, commission_percent, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      input.code, input.name,
      input.contact_email ?? null, input.contact_phone ?? null,
      input.kind ?? null, input.commission_percent,
      input.notes ?? null, input.is_active ?? true,
    ],
  );
  return rows[0].id;
}

export async function updateSeller(id: number, input: Partial<SellerInput>): Promise<boolean> {
  const fields = Object.keys(input);
  if (fields.length === 0) return true;
  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = fields.map((f) => (input as Record<string, unknown>)[f]);
  const result = await pool.query(
    `UPDATE sellers SET ${sets}, updated_at = NOW() WHERE id = $${fields.length + 1}`,
    [...values, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deactivateSeller(id: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE sellers SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Elimina permanentemente un vendedor.
 * Devuelve el supabase_user_id si tenía cuenta (para que la ruta lo borre de Supabase Auth).
 *
 * Si tiene ventas asociadas y `force` es false, lanza un error HAS_ORDERS (con el conteo)
 * para que el front pueda pedir confirmación reforzada.
 * Con `force: true`, borra también TODAS las órdenes que trajo el vendedor (decisión de
 * negocio): al eliminar las órdenes, el ON DELETE CASCADE limpia order_items y
 * order_attributions, y los payment_events quedan con order_id = NULL. Todo en una
 * transacción para no dejar el vendedor sin sus ventas (o viceversa) ante un fallo parcial.
 */
export async function deleteSeller(
  id: number,
  opts: { force?: boolean } = {},
): Promise<{ deleted: boolean; supabase_user_id: string | null; deleted_orders: number }> {
  const { rows: check } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM order_attributions WHERE seller_id = $1`,
    [id],
  );
  const orderCount = parseInt(check[0].cnt, 10);
  if (orderCount > 0 && !opts.force) {
    const err = new Error(
      `El vendedor tiene ${orderCount} venta(s) asociada(s). Eliminarlo borrará también esas ventas. Confirmá para continuar o desactivalo en su lugar.`,
    );
    (err as Error & { code: string; orderCount: number }).code = 'HAS_ORDERS';
    (err as Error & { code: string; orderCount: number }).orderCount = orderCount;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let deletedOrders = 0;
    if (orderCount > 0) {
      const del = await client.query(
        `DELETE FROM orders
          WHERE id IN (SELECT order_id FROM order_attributions WHERE seller_id = $1)`,
        [id],
      );
      deletedOrders = del.rowCount ?? 0;
    }

    const { rows } = await client.query<{ supabase_user_id: string | null }>(
      `DELETE FROM sellers WHERE id = $1 RETURNING supabase_user_id`,
      [id],
    );

    await client.query('COMMIT');

    if (rows.length === 0) return { deleted: false, supabase_user_id: null, deleted_orders: 0 };
    return { deleted: true, supabase_user_id: rows[0].supabase_user_id, deleted_orders: deletedOrders };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface SellerOrder {
  order_id: number;
  public_id: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_nationality: string | null;
  adults: number;
  children: number;
  total_usd: number;
  total_ars: number;
  exchange_rate_used: number;
  unit_price_adult_usd: number;
  unit_price_child_usd: number | null;
  subtotal_usd: number;
  service_date: string;
  option_id: number;
  product_name: string;
  option_name: string;
  commission_amount_usd: number;
  commission_amount_ars: number;
  net_total_usd: number | null;
  commission_percent_snapshot: number | null;
  paid_to_seller_at: string | null;
  net_settled_at: string | null;
  cash_collected_at: string | null;
  created_at: string;
  utm_source: string | null;
  payment_method: string;
  mp_init_point: string | null;
  // Trazabilidad de modificaciones
  was_reduced: boolean;
  has_paid_addon: boolean;
}

export async function listSellerOrders(
  sellerId: number,
  opts?: { status?: string; settlement?: 'pending' | 'settled' },
): Promise<SellerOrder[]> {
  const params: unknown[] = [sellerId];
  let statusFilter = '';
  if (opts?.status) {
    params.push(opts.status);
    statusFilter = ` AND o.status = $${params.length}`;
  }
  // Liquidación: MP se salda vía paid_to_seller_at, efectivo vía net_settled_at.
  let settlementFilter = '';
  if (opts?.settlement === 'pending') {
    settlementFilter = ` AND o.status = 'paid' AND (
      (o.payment_method = 'cash' AND a.net_settled_at IS NULL)
      OR (o.payment_method != 'cash' AND a.paid_to_seller_at IS NULL)
    )`;
  } else if (opts?.settlement === 'settled') {
    settlementFilter = ` AND o.status = 'paid' AND (
      (o.payment_method = 'cash' AND a.net_settled_at IS NOT NULL)
      OR (o.payment_method != 'cash' AND a.paid_to_seller_at IS NOT NULL)
    )`;
  }
  const { rows } = await pool.query<SellerOrder>(
    `SELECT
       o.id AS order_id, o.public_id, o.status::text AS status,
       o.customer_name, o.customer_email, o.customer_phone, o.customer_nationality,
       oi.adults, oi.children,
       o.total_usd::float AS total_usd,
       o.total_ars::float AS total_ars,
       o.exchange_rate_used::float AS exchange_rate_used,
       oi.unit_price_adult_usd::float AS unit_price_adult_usd,
       oi.unit_price_child_usd::float AS unit_price_child_usd,
       oi.subtotal_usd::float AS subtotal_usd,
       to_char(oi.service_date, 'YYYY-MM-DD') AS service_date,
       oi.option_id,
       oi.product_name_snapshot AS product_name,
       oi.option_name_snapshot AS option_name,
       a.commission_amount_usd::float AS commission_amount_usd,
       a.commission_amount_ars::float AS commission_amount_ars,
       a.net_total_usd_snapshot::float AS net_total_usd,
       a.commission_percent_snapshot::float AS commission_percent_snapshot,
       a.paid_to_seller_at, a.net_settled_at, o.cash_collected_at, o.created_at,
       o.utm_source, o.payment_method, o.mp_init_point,
       COALESCE(o.refunded_amount_ars, 0) > 0 AS was_reduced,
       EXISTS (
         SELECT 1 FROM order_addons ad WHERE ad.order_id = o.id AND ad.status = 'paid'
       ) AS has_paid_addon
       FROM order_attributions a
       JOIN orders o ON o.id = a.order_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE a.seller_id = $1
        AND o.archived_at IS NULL
        AND o.status NOT IN ('cancelled', 'refunded', 'expired', 'failed')
        ${statusFilter}${settlementFilter}
      ORDER BY o.created_at DESC`,
    params,
  );
  return rows;
}

/**
 * MP: marca como liquidada (pagada al vendedor) la comisión de las órdenes indicadas.
 * Solo afecta órdenes de Mercado Pago, pagadas y no marcadas todavía.
 */
export async function markCommissionsPaid(sellerId: number, orderIds: number[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const result = await pool.query(
    `UPDATE order_attributions
        SET paid_to_seller_at = NOW()
      WHERE seller_id = $1
        AND order_id = ANY($2::int[])
        AND paid_to_seller_at IS NULL
        AND EXISTS (
          SELECT 1 FROM orders o
           WHERE o.id = order_attributions.order_id
             AND o.status = 'paid'
             AND o.payment_method = 'mercadopago'
        )`,
    [sellerId, orderIds],
  );
  return result.rowCount ?? 0;
}

/**
 * Efectivo: marca como rendido el neto que el vendedor nos debía liquidar.
 * Solo afecta órdenes en efectivo, pagadas (cobradas) y no marcadas todavía.
 */
export async function markNetSettled(sellerId: number, orderIds: number[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const result = await pool.query(
    `UPDATE order_attributions
        SET net_settled_at = NOW()
      WHERE seller_id = $1
        AND order_id = ANY($2::int[])
        AND net_settled_at IS NULL
        AND EXISTS (
          SELECT 1 FROM orders o
           WHERE o.id = order_attributions.order_id
             AND o.status = 'paid'
             AND o.payment_method = 'cash'
        )`,
    [sellerId, orderIds],
  );
  return result.rowCount ?? 0;
}
