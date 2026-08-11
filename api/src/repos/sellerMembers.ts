import { pool } from '../db.js';
import { generatePin, hashPin, verifyPin } from '../services/pin.js';

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
  | { ok: true; memberId: number; memberName: string }
  | { ok: false; httpStatus: number; error: string };

/**
 * Valida que seller_member_id pertenezca al vendedor autenticado, esté activo, y que
 * el PIN ingresado coincida — usado donde el propio sub-vendedor se identifica en
 * persona (alta de reserva, confirmación de cobro en efectivo). Para el tag-eo
 * posterior de una orden ya creada (asignarle a alguien una venta que no cerró él
 * mismo) se usa `findActiveSellerMember` + `requireAdminPin` en su lugar — ahí quien
 * autoriza es el administrador del vendedor, no el sub-vendedor asignado.
 */
export async function resolveSellerMember(
  sellerId: number,
  sellerMemberId: number,
  pin: string,
): Promise<ResolveMemberResult> {
  const { rows } = await pool.query<{ id: number; name: string; pin_hash: string }>(
    `SELECT id, name, pin_hash FROM seller_members WHERE id = $1 AND seller_id = $2 AND is_active = TRUE LIMIT 1`,
    [sellerMemberId, sellerId],
  );
  const member = rows[0];
  if (!member) return { ok: false, httpStatus: 404, error: 'No encontramos a esa persona en tu equipo.' };
  if (!verifyPin(pin, member.pin_hash)) return { ok: false, httpStatus: 403, error: 'PIN incorrecto.' };
  return { ok: true, memberId: member.id, memberName: member.name };
}

/**
 * Igual que `resolveSellerMember` pero sin pedir el PIN del sub-vendedor — para
 * cuando quien autoriza la asignación es el administrador del vendedor (con su
 * propio PIN, ver `requireAdminPin`), no la persona que se está asignando.
 */
export async function findActiveSellerMember(
  sellerId: number,
  sellerMemberId: number,
): Promise<{ id: number; name: string } | null> {
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM seller_members WHERE id = $1 AND seller_id = $2 AND is_active = TRUE LIMIT 1`,
    [sellerMemberId, sellerId],
  );
  return rows[0] ?? null;
}

/**
 * PIN de administrador del vendedor (distinto del PIN de cada seller_member): lo carga
 * el equipo (admin panel) al dar de alta un vendedor con sub-vendedores. Gatea crear
 * miembros y editar el registro de OTRO miembro (activar/desactivar, resetear su PIN),
 * y asignar/corregir retroactivamente qué sub-vendedor cerró una venta.
 */
export async function getSellerAdminPinHash(sellerId: number): Promise<string | null> {
  const { rows } = await pool.query<{ admin_pin_hash: string | null }>(
    `SELECT admin_pin_hash FROM sellers WHERE id = $1 LIMIT 1`,
    [sellerId],
  );
  return rows[0]?.admin_pin_hash ?? null;
}

/**
 * Da un mensaje distinto según si el PIN admin directamente no está configurado
 * (nosotros tenemos que activarlo) vs. si el que se ingresó está mal.
 */
export async function requireAdminPin(
  sellerId: number,
  adminPin: string | undefined,
): Promise<{ ok: true } | { ok: false; httpStatus: number; error: string }> {
  if (!adminPin) return { ok: false, httpStatus: 400, error: 'Ingresá el PIN de administrador.' };
  const hash = await getSellerAdminPinHash(sellerId);
  if (!hash) return { ok: false, httpStatus: 409, error: 'Todavía no tenés un PIN de administrador configurado. Contactanos para activarlo.' };
  if (!verifyPin(adminPin, hash)) return { ok: false, httpStatus: 403, error: 'PIN de administrador incorrecto.' };
  return { ok: true };
}

/**
 * Blanqueo de emergencia: un super_admin desde el panel interno le genera un PIN
 * nuevo a un sub-vendedor puntual, sin depender de que tenga email cargado ni del
 * PIN de administrador del vendedor (que puede ser justo lo que se perdió). Además
 * de reemplazar el PIN, invalida cualquier link de "olvidé mi PIN" pendiente de esa
 * persona para que no queden dos caminos de reset abiertos al mismo tiempo. Devuelve
 * el PIN en texto plano una sola vez — el admin lo tiene que comunicar a mano.
 */
export async function resetSellerMemberPinByAdmin(
  sellerId: number,
  memberId: number,
): Promise<{ id: number; name: string; pin: string } | null> {
  const pin = generatePin();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: number; name: string }>(
      `UPDATE seller_members SET pin_hash = $1 WHERE id = $2 AND seller_id = $3 RETURNING id, name`,
      [hashPin(pin), memberId, sellerId],
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE seller_member_pin_resets SET used_at = NOW() WHERE seller_member_id = $1 AND used_at IS NULL`,
      [memberId],
    );
    await client.query('COMMIT');
    return { id: rows[0].id, name: rows[0].name, pin };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Autogestión del PIN de administrador (visible en "Mi equipo") ────────
// A diferencia de cada seller_member, hay uno solo por vendedor y NO tiene un flujo
// de "olvidé mi PIN" por email — si se pierde del todo, se resuelve desde el panel
// interno (ver adminSellersRouter POST /:id/admin-pin, restringido a super_admin).
// Acá solo habilitamos que quien YA lo tiene pueda cambiarlo y cargar/editar el
// email de contacto asociado, sin depender de nosotros para cada ajuste menor.

export interface SellerAdminPinInfo {
  has_admin_pin: boolean;
  email: string | null;
}

export async function getSellerAdminPinInfo(sellerId: number): Promise<SellerAdminPinInfo> {
  const { rows } = await pool.query<{ admin_pin_hash: string | null; admin_pin_email: string | null }>(
    `SELECT admin_pin_hash, admin_pin_email FROM sellers WHERE id = $1 LIMIT 1`,
    [sellerId],
  );
  const row = rows[0];
  return { has_admin_pin: !!row?.admin_pin_hash, email: row?.admin_pin_email ?? null };
}

export type UpdateAdminPinResult =
  | { ok: true; info: SellerAdminPinInfo }
  | { ok: false; httpStatus: number; error: string };

export async function updateSellerAdminPin(
  sellerId: number,
  input: { pin?: string; email?: string | null; current_pin?: string },
): Promise<UpdateAdminPinResult> {
  const { rows } = await pool.query<{ admin_pin_hash: string | null; admin_pin_email: string | null }>(
    `SELECT admin_pin_hash, admin_pin_email FROM sellers WHERE id = $1 LIMIT 1`,
    [sellerId],
  );
  const current = rows[0];
  if (!current) return { ok: false, httpStatus: 404, error: 'No encontrado' };

  // Cargar el email por primera vez (todavía no tenía ninguno) no pide PIN — mismo
  // criterio que en seller_members: ya estás logueado en esta cuenta de vendedor,
  // que es el gate real acá.
  const settingEmailFirstTime = current.admin_pin_email == null
    && input.email != null && input.email.trim() !== ''
    && input.pin === undefined;

  if (!settingEmailFirstTime) {
    if (!current.admin_pin_hash) {
      return { ok: false, httpStatus: 409, error: 'Todavía no tenés un PIN de administrador configurado. Contactanos para activarlo.' };
    }
    if (!input.current_pin || !verifyPin(input.current_pin, current.admin_pin_hash)) {
      return { ok: false, httpStatus: 403, error: 'PIN de administrador actual incorrecto.' };
    }
  }

  const { rows: updated } = await pool.query<{ admin_pin_hash: string | null; admin_pin_email: string | null }>(
    `UPDATE sellers
        SET admin_pin_hash = COALESCE($2, admin_pin_hash),
            admin_pin_email = CASE WHEN $3::boolean THEN $4 ELSE admin_pin_email END,
            updated_at = NOW()
      WHERE id = $1
      RETURNING admin_pin_hash, admin_pin_email`,
    [sellerId, input.pin ? hashPin(input.pin) : null, input.email !== undefined, input.email || null],
  );
  const row = updated[0];
  return { ok: true, info: { has_admin_pin: !!row.admin_pin_hash, email: row.admin_pin_email ?? null } };
}

// ─── Reset del PIN de administrador por email (para cuando SÍ lo perdió del todo
// y no puede autogestionarlo con updateSellerAdminPin) — mismo patrón que el reset
// de un seller_member (ver más abajo), pero atado a sellers.admin_pin_email en vez
// de a un seller_member puntual. Pedirlo es interno (sesión de esta cuenta + saber
// el email exacto cargado); completar el link no requiere sesión.

const ADMIN_PIN_RESET_TTL_HOURS = 2;

export async function createAdminPinResetToken(sellerId: number): Promise<string> {
  const { rows } = await pool.query<{ token: string }>(
    `INSERT INTO seller_admin_pin_resets (seller_id, expires_at)
     VALUES ($1, NOW() + INTERVAL '${ADMIN_PIN_RESET_TTL_HOURS} hours')
     RETURNING token`,
    [sellerId],
  );
  return rows[0].token;
}

export interface AdminPinResetPreview { sellerName: string }

export async function getAdminPinResetPreview(token: string): Promise<AdminPinResetPreview | null> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT s.name
       FROM seller_admin_pin_resets r
       JOIN sellers s ON s.id = r.seller_id
      WHERE r.token = $1 AND r.used_at IS NULL AND r.expires_at > NOW()
      LIMIT 1`,
    [token],
  );
  return rows[0] ? { sellerName: rows[0].name } : null;
}

/**
 * Consume el token (un solo uso, atómico) y setea el PIN de administrador nuevo.
 * Devuelve false si el token ya se usó, venció, o no existe.
 */
export async function consumeAdminPinReset(token: string, newPin: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ seller_id: number }>(
      `UPDATE seller_admin_pin_resets
          SET used_at = NOW()
        WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING seller_id`,
      [token],
    );
    const sellerId = rows[0]?.seller_id;
    if (!sellerId) { await client.query('ROLLBACK'); return false; }
    await client.query(`UPDATE sellers SET admin_pin_hash = $1, updated_at = NOW() WHERE id = $2`, [hashPin(newPin), sellerId]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type DeleteMemberResult =
  | { ok: true }
  | { ok: false; httpStatus: number; error: string };

/**
 * Borrado real (no desactivar) de un sub-vendedor — solo si nunca tuvo ventas
 * atribuidas: si las tiene, borrar dejaría esas órdenes sin registro de quién las
 * cerró (order_attributions.seller_member_id → ON DELETE SET NULL), y eso es
 * historial que no se puede reconstruir. En ese caso hay que desactivarlo en su
 * lugar (ver PATCH is_active), que no borra nada.
 */
export async function deleteSellerMember(sellerId: number, memberId: number): Promise<DeleteMemberResult> {
  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM seller_members WHERE id = $1 AND seller_id = $2 LIMIT 1`,
    [memberId, sellerId],
  );
  if (!existing[0]) return { ok: false, httpStatus: 404, error: 'No encontrado' };

  const { rows: attrRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM order_attributions WHERE seller_member_id = $1`,
    [memberId],
  );
  if (Number(attrRows[0].count) > 0) {
    return { ok: false, httpStatus: 409, error: 'Esta persona ya tiene ventas registradas — no se puede eliminar. Desactivala en su lugar.' };
  }

  await pool.query(`DELETE FROM seller_members WHERE id = $1 AND seller_id = $2`, [memberId, sellerId]);
  return { ok: true };
}

export async function sellerHasActiveMembers(sellerId: number): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM seller_members WHERE seller_id = $1 AND is_active = TRUE) AS exists`,
    [sellerId],
  );
  return rows[0]?.exists ?? false;
}

export type RequireMemberResult =
  | { ok: true; memberId: number | null; memberName: string | null }
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
  if (!hasTeam) return { ok: true, memberId: null, memberName: null };
  if (!input.seller_member_id || !input.seller_member_pin) {
    return { ok: false, httpStatus: 400, error: 'Ingresá quién sos y tu PIN para continuar.' };
  }
  return resolveSellerMember(sellerId, input.seller_member_id, input.seller_member_pin);
}

export type ResolveMemberOrAdminResult =
  | { ok: true; memberId: number | null; memberName: string | null; byAdmin: boolean }
  | { ok: false; httpStatus: number; error: string };

/**
 * Igual que `requireMemberIfTeamExists`, pero con salida de emergencia: si no viene
 * el PIN de la persona (no está disponible, nadie tiene su PIN), el administrador del
 * vendedor puede desbloquear la acción con SU propio PIN. `byAdmin` le indica al caller
 * si tiene que dejarlo anotado en el historial de la orden como hecho por el admin, en
 * vez de por la persona correspondiente.
 */
export async function resolveMemberOrAdmin(
  sellerId: number,
  input: { seller_member_id?: number; seller_member_pin?: string; admin_pin?: string },
): Promise<ResolveMemberOrAdminResult> {
  const hasTeam = await sellerHasActiveMembers(sellerId);
  if (!hasTeam) return { ok: true, memberId: null, memberName: null, byAdmin: false };

  if (input.seller_member_id != null && input.seller_member_pin) {
    const resolved = await resolveSellerMember(sellerId, input.seller_member_id, input.seller_member_pin);
    if (!resolved.ok) return resolved;
    return { ok: true, memberId: resolved.memberId, memberName: resolved.memberName, byAdmin: false };
  }

  const adminCheck = await requireAdminPin(sellerId, input.admin_pin);
  if (!adminCheck.ok) return adminCheck;
  let memberId: number | null = null;
  let memberName: string | null = null;
  if (input.seller_member_id != null) {
    const member = await findActiveSellerMember(sellerId, input.seller_member_id);
    if (!member) return { ok: false, httpStatus: 404, error: 'No encontramos a esa persona en tu equipo.' };
    memberId = member.id;
    memberName = member.name;
  }
  return { ok: true, memberId, memberName, byAdmin: true };
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
