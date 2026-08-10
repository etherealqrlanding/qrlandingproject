import { pool } from '../db.js';
import { hashPin, verifyPin } from '../services/pin.js';

export interface SellerMember {
  id: number;
  name: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SellerMemberStats extends SellerMember {
  orders_paid: number;
  revenue_paid_ars: number;
}

export async function listSellerMembers(sellerId: number): Promise<SellerMember[]> {
  const { rows } = await pool.query<SellerMember>(
    `SELECT id, name, email, is_active, created_at
       FROM seller_members
      WHERE seller_id = $1
      ORDER BY is_active DESC, name`,
    [sellerId],
  );
  return rows;
}

export async function listSellerMemberStats(sellerId: number): Promise<SellerMemberStats[]> {
  const { rows } = await pool.query<SellerMemberStats>(
    `SELECT
       m.id, m.name, m.email, m.is_active, m.created_at,
       COUNT(*) FILTER (WHERE o.status = 'paid')::int AS orders_paid,
       COALESCE(SUM(o.total_ars) FILTER (WHERE o.status = 'paid'), 0)::float AS revenue_paid_ars
       FROM seller_members m
       LEFT JOIN order_attributions a ON a.seller_member_id = m.id
       LEFT JOIN orders o ON o.id = a.order_id
      WHERE m.seller_id = $1
      GROUP BY m.id, m.name, m.email, m.is_active, m.created_at
      ORDER BY m.is_active DESC, m.name`,
    [sellerId],
  );
  return rows;
}

export type ResolveMemberResult =
  | { ok: true; memberId: number }
  | { ok: false; httpStatus: number; error: string };

/**
 * Valida que seller_member_id pertenezca al vendedor autenticado, esté activo, y que
 * el PIN ingresado coincida — punto único usado en todos los lugares donde se
 * atribuye una venta a un sub-vendedor (alta de reserva, confirmación de cobro en
 * efectivo, tag-eo posterior de una orden ya creada).
 */
export async function resolveSellerMember(
  sellerId: number,
  sellerMemberId: number,
  pin: string,
): Promise<ResolveMemberResult> {
  const { rows } = await pool.query<{ id: number; pin_hash: string }>(
    `SELECT id, pin_hash FROM seller_members WHERE id = $1 AND seller_id = $2 AND is_active = TRUE LIMIT 1`,
    [sellerMemberId, sellerId],
  );
  const member = rows[0];
  if (!member) return { ok: false, httpStatus: 404, error: 'No encontramos a esa persona en tu equipo.' };
  if (!verifyPin(pin, member.pin_hash)) return { ok: false, httpStatus: 403, error: 'PIN incorrecto.' };
  return { ok: true, memberId: member.id };
}

/**
 * PIN de administrador del vendedor (distinto del PIN de cada seller_member): lo carga
 * el equipo (admin panel) al dar de alta un vendedor con sub-vendedores. Gatea crear
 * miembros y editar el registro de OTRO miembro (activar/desactivar, resetear su PIN).
 */
export async function getSellerAdminPinHash(sellerId: number): Promise<string | null> {
  const { rows } = await pool.query<{ admin_pin_hash: string | null }>(
    `SELECT admin_pin_hash FROM sellers WHERE id = $1 LIMIT 1`,
    [sellerId],
  );
  return rows[0]?.admin_pin_hash ?? null;
}

export async function sellerHasActiveMembers(sellerId: number): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM seller_members WHERE seller_id = $1 AND is_active = TRUE) AS exists`,
    [sellerId],
  );
  return rows[0]?.exists ?? false;
}

export type RequireMemberResult =
  | { ok: true; memberId: number | null }
  | { ok: false; httpStatus: number; error: string };

/**
 * Gate para acciones sensibles (modificar/cancelar/cobrar) sobre una orden. Si el
 * vendedor tiene equipo cargado, exige seller_member_id + PIN válidos antes de dejar
 * pasar — "no se puede tocar la orden sin que alguien del equipo se identifique". Si
 * el vendedor no tiene equipo (caso normal, vendedor individual), no exige nada: se
 * comporta como antes de esta feature.
 */
export async function requireMemberIfTeamExists(
  sellerId: number,
  input: { seller_member_id?: number; seller_member_pin?: string },
): Promise<RequireMemberResult> {
  const hasTeam = await sellerHasActiveMembers(sellerId);
  if (!hasTeam) return { ok: true, memberId: null };
  if (!input.seller_member_id || !input.seller_member_pin) {
    return { ok: false, httpStatus: 400, error: 'Ingresá quién sos y tu PIN para continuar.' };
  }
  return resolveSellerMember(sellerId, input.seller_member_id, input.seller_member_pin);
}

// ─── Reset de PIN por email (interno: exige la sesión del vendedor, ver
// routes/seller/members.ts POST /:id/forgot-pin — sin login público) ──────

const PIN_RESET_TTL_HOURS = 2;

export async function createPinResetToken(sellerMemberId: number): Promise<string> {
  const { rows } = await pool.query<{ token: string }>(
    `INSERT INTO seller_member_pin_resets (seller_member_id, expires_at)
     VALUES ($1, NOW() + INTERVAL '${PIN_RESET_TTL_HOURS} hours')
     RETURNING token`,
    [sellerMemberId],
  );
  return rows[0].token;
}

export interface PinResetPreview { memberName: string }

export async function getPinResetPreview(token: string): Promise<PinResetPreview | null> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT m.name
       FROM seller_member_pin_resets r
       JOIN seller_members m ON m.id = r.seller_member_id
      WHERE r.token = $1 AND r.used_at IS NULL AND r.expires_at > NOW() AND m.is_active = TRUE
      LIMIT 1`,
    [token],
  );
  return rows[0] ? { memberName: rows[0].name } : null;
}

/**
 * Consume el token (un solo uso, atómico) y setea el PIN nuevo. Devuelve false si el
 * token ya se usó, venció, o no existe — el caller responde 410 genérico.
 */
export async function consumePinReset(token: string, newPin: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ seller_member_id: number }>(
      `UPDATE seller_member_pin_resets
          SET used_at = NOW()
        WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING seller_member_id`,
      [token],
    );
    const memberId = rows[0]?.seller_member_id;
    if (!memberId) { await client.query('ROLLBACK'); return false; }
    await client.query(`UPDATE seller_members SET pin_hash = $1 WHERE id = $2`, [hashPin(newPin), memberId]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
